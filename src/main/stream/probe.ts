import { execFile } from 'node:child_process'
import type { ProbeResult, StreamKind } from '@shared/types'
import { resolveFfmpeg, ffprobePathFor } from './ffmpegLocator'
import { requestFollowingRedirects } from '../http'

const PROBE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const HLS_CONTENT_TYPES = /mpegurl/i
const TS_CONTENT_TYPES = /mp2t|video\/mp4|octet-stream/i

function kindFromExtension(url: string): StreamKind | null {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  if (clean.endsWith('.m3u8') || clean.endsWith('.m3u')) return 'hls'
  if (clean.endsWith('.ts') || clean.endsWith('.mts') || clean.endsWith('.mpg')) return 'ts'
  return null
}

function decideNeedsTranscode(kind: StreamKind, videoCodec: string | null, audioCodec: string | null): boolean {
  if (kind === 'ts') {
    const videoOk = !videoCodec || videoCodec === 'h264'
    const audioOk = !audioCodec || ['aac', 'mp3'].includes(audioCodec)
    return !(videoOk && audioOk) // remux handles h264/aac; anything else reencodes
  }
  if (kind === 'hls') {
    // Chromium reliably decodes h264/aac; hevc is hw-dependent and mpeg2/mp3-in-TS fails, so reencode.
    const videoOk = !videoCodec || videoCodec === 'h264'
    const audioOk = !audioCodec || audioCodec === 'aac' || audioCodec.startsWith('mp4a')
    return !(videoOk && audioOk)
  }
  return true
}

interface FfprobeOutput {
  streams?: Array<{ codec_type?: string; codec_name?: string }>
  format?: { format_name?: string }
}

async function ffprobe(url: string, userAgent: string | null, referrer: string | null): Promise<ProbeResult> {
  const ffmpegInfo = await resolveFfmpeg()
  if (!ffmpegInfo.probeAvailable) {
    return { kind: 'other', needsTranscode: true, videoCodec: null, audioCodec: null, container: null, probedVia: 'unknown' }
  }
  const ffprobeBin = ffmpegInfo.path ? ffprobePathFor(ffmpegInfo.path) : 'ffprobe'

  const args = [
    '-v', 'error',
    '-probesize', '4000000',
    '-analyzeduration', '4000000',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    url
  ]
  const env = { ...process.env }
  if (userAgent) env.UA = userAgent
  if (referrer) env.REF = referrer

  return new Promise((resolve) => {
    const child = execFile(
      ffprobeBin,
      args,
      { timeout: 8000, maxBuffer: 4 * 1024 * 1024, env },
      (err, stdout) => {
        if (err && !stdout) {
          resolve(null as unknown as ProbeResult)
          return
        }
        try {
          const parsed = JSON.parse(stdout) as FfprobeOutput
          const video = parsed.streams?.find((s) => s.codec_type === 'video')
          const audio = parsed.streams?.find((s) => s.codec_type === 'audio')
          const formatName = parsed.format?.format_name ?? ''
          const kind: StreamKind = formatName.includes('hls')
            ? 'hls'
            : formatName.includes('mpegts')
              ? 'ts'
              : 'other'
          const videoCodec = video?.codec_name ?? null
          const audioCodec = audio?.codec_name ?? null
          resolve({
            kind,
            needsTranscode: decideNeedsTranscode(kind, videoCodec, audioCodec),
            videoCodec,
            audioCodec,
            container: formatName || null,
            probedVia: 'ffprobe'
          })
        } catch {
          resolve(null as unknown as ProbeResult)
        }
      }
    )
    child.on('error', () => resolve(null as unknown as ProbeResult))
  })
}

/**
 * Probe a stream URL. Cheap checks first (cache → extension → content-type
 * sniff), ffprobe only when still inconclusive. Returns `null` when nothing
 * could be determined (caller falls back to direct-hls with auto-retry).
 */
export async function probeStream(
  url: string,
  cached: { kind: StreamKind | null; needsTranscode: 0 | 1 | null; probeCheckedAt: number | null } | null,
  headers: { userAgent: string | null; referrer: string | null } = { userAgent: null, referrer: null }
): Promise<ProbeResult | null> {
  if (cached?.kind && cached.probeCheckedAt && Date.now() - cached.probeCheckedAt < PROBE_MAX_AGE_MS) {
    return {
      kind: cached.kind,
      needsTranscode: cached.needsTranscode === 1,
      videoCodec: null,
      audioCodec: null,
      container: null,
      probedVia: 'cache'
    }
  }

  const extKind = kindFromExtension(url)
  if (extKind === 'hls') {
    return {
      kind: 'hls',
      needsTranscode: false,
      videoCodec: null,
      audioCodec: null,
      container: 'hls',
      probedVia: 'extension'
    }
  }

  // Content-type sniff: read just the headers, then abort.
  try {
    const response = await requestFollowingRedirects(url, {
      method: 'GET',
      headers: { range: 'bytes=0-1', 'user-agent': headers.userAgent ?? 'IPTV-Streamer/0.1' },
      headersTimeout: 5000,
      bodyTimeout: 5000
    }, 3)
    const contentType = response.headers['content-type']?.toString() ?? ''
    response.body.destroy()
    if (HLS_CONTENT_TYPES.test(contentType)) {
      return { kind: 'hls', needsTranscode: false, videoCodec: null, audioCodec: null, container: contentType, probedVia: 'content-type' }
    }
    if (extKind === 'ts' || TS_CONTENT_TYPES.test(contentType)) {
      const viaFfprobe = await ffprobe(url, headers.userAgent, headers.referrer)
      return viaFfprobe ?? { kind: 'ts', needsTranscode: true, videoCodec: null, audioCodec: null, container: contentType, probedVia: 'content-type' }
    }
  } catch {
    // fall through to ffprobe / unknown
  }

  const viaFfprobe = await ffprobe(url, headers.userAgent, headers.referrer)
  if (viaFfprobe) return viaFfprobe

  // Extension said .ts but nothing confirmed the codecs — assume TS needing remux.
  if (extKind === 'ts') {
    return { kind: 'ts', needsTranscode: false, videoCodec: null, audioCodec: null, container: null, probedVia: 'extension' }
  }
  return null
}