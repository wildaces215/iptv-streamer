import { execFile } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import type { FfmpegInfo } from '@shared/types'

let cached: FfmpegInfo | null = null

function tryPaths(): { path: string; source: FfmpegInfo['source'] } {
  const exeSuffix = process.platform === 'win32' ? '.exe' : ''
  // 1. Explicit env override
  if (process.env.IPTV_FFMPEG_PATH) return { path: process.env.IPTV_FFMPEG_PATH, source: 'env' }
  // 2. Binary shipped in app resources (extraResources/ffmpeg)
  if (process.resourcesPath) {
    return { path: path.join(process.resourcesPath, 'ffmpeg', `ffmpeg${exeSuffix}`), source: 'packaged' }
  }
  // 3. System PATH (checked at runtime via execFile)
  return { path: `ffmpeg${exeSuffix}`, source: 'system-path' }
}

/** Sibling ffprobe path for an ffmpeg path ('/x/ffmpeg.exe' → '/x/ffprobe.exe'). */
export function ffprobePathFor(ffmpegPath: string): string {
  const suffix = process.platform === 'win32' ? '.exe' : ''
  return ffmpegPath.replace(/ffmpeg(\.exe)?$/, `ffprobe${suffix}`)
}

function probeBin(bin: string): Promise<{ ok: boolean; version: string | null }> {
  return new Promise((resolve) => {
    const child = execFile(bin, ['-version'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ ok: false, version: null })
        return
      }
      const version = stdout.match(/ffmpeg version (\S+)/)?.[1] ?? null
      resolve({ ok: true, version })
    })
    child.on('error', () => resolve({ ok: false, version: null }))
  })
}

export async function resolveFfmpeg(): Promise<FfmpegInfo> {
  if (cached) return cached
  const candidate = tryPaths()
  const result = await probeBin(candidate.path)
  cached = {
    available: result.ok,
    path: result.ok ? candidate.path : null,
    source: result.ok ? candidate.source : 'none',
    version: result.version,
    probeAvailable: result.ok
  }
  return cached
}

/** Reset the cache — used in dev when the user installs ffmpeg after launch. */
export function resetFfmpegCache(): void {
  cached = null
}

export function isDev(): boolean {
  return !app.isPackaged
}