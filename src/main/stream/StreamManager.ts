import { spawn, ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { IPC_EVENT } from '@shared/ipc-channels'
import type {
  ProbeResult,
  StreamEvent,
  StreamMode,
  StreamSessionInfo,
  StreamStartResult,
  StreamStatus
} from '@shared/types'
import * as channelRepo from '../db/repositories/channelRepo'
import { resolveFfmpeg } from './ffmpegLocator'
import { buildFfmpegArgs, modeForProbe } from './ffmpegArgs'
import { probeStream } from './probe'
import { LocalStreamServer } from './LocalStreamServer'
import { isProcessAlive, killProcessTree } from './processKill'

interface Session {
  sessionId: string
  channelId: number
  mode: StreamMode
  dir: string
  child: ChildProcess | null
  startedAt: number
  lastRequestAt: number
  stderrTail: string[]
}

const READY_TIMEOUT_MS = 20_000
const IDLE_KILL_MS = 45_000
const IDLE_CHECK_INTERVAL_MS = 15_000

class StreamManagerImpl {
  private server = new LocalStreamServer()
  private sessions = new Map<string, Session>()
  private watchdog: NodeJS.Timeout | null = null

  async probeChannel(channelId: number): Promise<ProbeResult | null> {
    const channel = channelRepo.getChannel(channelId)
    if (!channel) throw new Error(`Channel ${channelId} not found`)
    const probe = await probeStream(channel.url, {
      kind: channel.kind,
      needsTranscode: channel.needsTranscode,
      probeCheckedAt: channel.probeCheckedAt
    }, { userAgent: channel.userAgent, referrer: channel.referrer })
    if (probe) {
      channelRepo.saveProbeResult(channelId, probe.kind, probe.needsTranscode)
    }
    return probe
  }

  async start(channelId: number, opts: { forceTranscode?: boolean } = {}): Promise<StreamStartResult> {
    await this.stopAll('channel-switch')
    const channel = channelRepo.getChannel(channelId)
    if (!channel) throw new Error(`Channel ${channelId} not found`)

    const probe = await this.probeChannel(channelId)
    const ffmpeg = await resolveFfmpeg()

    let mode: StreamMode = probe ? modeForProbe(probe) : 'direct-hls'
    if (opts.forceTranscode) {
      if (!ffmpeg.available) {
        throw new Error('ffmpeg is required to transcode this stream — install it with: sudo dnf install ffmpeg')
      }
      mode = probe?.kind === 'ts' && !probe.needsTranscode ? 'transcode-remux' : 'transcode-reencode'
    }
    if ((mode === 'transcode-remux' || mode === 'transcode-reencode') && !ffmpeg.available) {
      throw new Error('This stream needs ffmpeg to play — install it with: sudo dnf install ffmpeg')
    }

    const sessionId = crypto.randomUUID()
    const dir = path.join(app.getPath('temp'), 'iptv-streamer', sessionId)
    await fs.mkdir(dir, { recursive: true })
    this.server.registerSession(sessionId, dir, () => {
      const session = this.sessions.get(sessionId)
      if (session) session.lastRequestAt = Date.now()
    })

    if (mode === 'direct-hls') {
      this.sessions.set(sessionId, {
        sessionId, channelId, mode, dir, child: null,
        startedAt: Date.now(), lastRequestAt: Date.now(), stderrTail: []
      })
      this.ensureWatchdog()
      return {
        sessionId,
        channelId,
        playbackUrl: `${this.server.baseUrl}/proxy?url=${encodeURIComponent(channel.url)}`,
        mode,
        probe: probe ?? { kind: 'other', needsTranscode: false, videoCodec: null, audioCodec: null, container: null, probedVia: 'unknown' }
      }
    }

    const session: Session = {
      sessionId, channelId, mode, dir, child: null,
      startedAt: Date.now(), lastRequestAt: Date.now(), stderrTail: []
    }
    this.sessions.set(sessionId, session)
    this.emitEvent({ sessionId, type: 'spawned' })

    const args = buildFfmpegArgs(
      { url: channel.url, userAgent: channel.userAgent, referrer: channel.referrer },
      dir,
      mode
    )
    const child = spawn(ffmpeg.path as string, args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
    session.child = child
    if (child.pid) await fs.writeFile(path.join(dir, 'pid'), String(child.pid))

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      session.stderrTail.push(...text.split(/\r?\n/).filter(Boolean))
      if (session.stderrTail.length > 200) session.stderrTail.splice(0, session.stderrTail.length - 200)
      this.emitEvent({ sessionId, type: 'stderr', message: text.toString() })
    })
    child.on('exit', (code) => {
      this.emitEvent({ sessionId, type: 'exit', code: code ?? undefined })
      // Unexpected exit while still tracked → surface as error to the UI.
      if (this.sessions.has(sessionId)) {
        this.emitEvent({
          sessionId,
          type: 'error',
          message: `ffmpeg exited (code ${code ?? 'null'}): ${session.stderrTail.slice(-10).join(' | ')}`
        })
        void this.stop(sessionId)
      }
    })

    await this.waitForManifest(dir)

    this.ensureWatchdog()
    return {
      sessionId,
      channelId,
      playbackUrl: `${this.server.baseUrl}/hls/${sessionId}/index.m3u8`,
      mode,
      probe: probe ?? { kind: 'ts', needsTranscode: false, videoCodec: null, audioCodec: null, container: null, probedVia: 'unknown' }
    }
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)

    // Detach from the server first so in-flight hls.js requests 404 immediately.
    this.server.removeSession(sessionId)

    const pid = session.child?.pid
    if (pid && session.child) {
      const child = session.child
      child.kill('SIGTERM')
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000))
      await Promise.race([exited, timeout])
      if (child.exitCode === null) killProcessTree(pid)
    }
    await fs.rm(session.dir, { recursive: true, force: true }).catch(() => {})
    this.emitEvent({ sessionId, type: 'exit', code: 0 })
  }

  async stopAll(reason: 'channel-switch' | 'quit' | 'idle' | 'error'): Promise<void> {
    const ids = [...this.sessions.keys()]
    await Promise.all(ids.map((id) => this.stop(id)))
    if (reason !== 'channel-switch') this.stopWatchdog()
  }

  getStatus(): StreamStatus {
    const sessions: StreamSessionInfo[] = [...this.sessions.values()].map((s) => ({
      sessionId: s.sessionId,
      channelId: s.channelId,
      mode: s.mode,
      startedAt: s.startedAt,
      lastRequestAt: s.lastRequestAt,
      bytesServed: 0
    }))
    return { sessions, serverPort: this.server.port }
  }

  async shutdown(): Promise<void> {
    await this.stopAll('quit')
    await this.server.close()
    this.stopWatchdog()
  }

  /** Kill orphaned ffmpeg processes from a crashed previous run and clear temp dirs. */
  async recoverFromCrash(): Promise<void> {
    const root = path.join(app.getPath('temp'), 'iptv-streamer')
    let entries
    try {
      entries = await fs.readdir(root)
    } catch {
      return
    }
    for (const sessionId of entries) {
      const dir = path.join(root, sessionId)
      try {
        const pid = Number((await fs.readFile(path.join(dir, 'pid'), 'utf8')).trim())
        if (Number.isFinite(pid) && pid > 0 && isProcessAlive(pid)) {
          killProcessTree(pid)
        }
      } catch {
        // no pid file — fine
      }
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  }

  private async waitForManifest(dir: string): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      try {
        const manifest = await fs.readFile(path.join(dir, 'index.m3u8'), 'utf8')
        if (manifest.includes('.ts')) return
      } catch {
        // not written yet
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error('ffmpeg did not produce an HLS manifest in time')
  }

  private ensureWatchdog(): void {
    if (this.watchdog) return
    this.watchdog = setInterval(() => {
      const now = Date.now()
      for (const session of this.sessions.values()) {
        if (now - session.lastRequestAt > IDLE_KILL_MS) {
          void this.stop(session.sessionId)
        }
      }
    }, IDLE_CHECK_INTERVAL_MS)
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog)
    this.watchdog = null
  }

  private emitEvent(event: StreamEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_EVENT.StreamEvent, event)
    }
  }
}

export const streamManager = new StreamManagerImpl()