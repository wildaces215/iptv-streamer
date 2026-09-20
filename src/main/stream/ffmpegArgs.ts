import type { ProbeResult, StreamMode } from '@shared/types'

const HLS_MUXER_ARGS = [
  '-f', 'hls',
  '-hls_time', '4',
  '-hls_list_size', '6',
  '-hls_delete_threshold', '4',
  '-hls_flags', 'delete_segments+append_list+omit_endlist+program_date_time',
  '-hls_segment_type', 'mpegts',
  '-hls_allow_cache', '0'
]

export interface FfmpegInputOptions {
  url: string
  userAgent: string | null
  referrer: string | null
}

/** Input-side args shared by every transcode mode. */
function buildInputArgs(opts: FfmpegInputOptions): string[] {
  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-nostdin',
    '-y',
    '-fflags', '+genpts+discardcorrupt+igndts',
    '-flags', 'low_delay',
    '-analyzeduration', '4000000',
    '-probesize', '4000000',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-rw_timeout', '10000000',
    '-protocol_whitelist', 'file,http,https,tcp,tls'
  ]
  if (opts.userAgent) args.push('-user_agent', opts.userAgent)
  if (opts.referrer) args.push('-referer', opts.referrer)
  args.push('-i', opts.url)
  return args
}

/**
 * Build the ffmpeg argv for a transcode session.
 * - remux   (-c copy): MPEG-TS already carrying h264/aac — near-zero CPU.
 * - reencode: probe found codecs Chromium cannot decode (mpeg2, hevc, ac3…).
 */
export function buildFfmpegArgs(
  opts: FfmpegInputOptions,
  sessionDir: string,
  mode: 'transcode-remux' | 'transcode-reencode'
): string[] {
  const args = buildInputArgs(opts)

  if (mode === 'transcode-remux') {
    args.push(
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero'
    )
  } else {
    args.push(
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-sn', '-dn',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-profile:v', 'main',
      '-level', '4.1',
      '-pix_fmt', 'yuv420p',
      '-g', '48',
      '-keyint_min', '48',
      '-sc_threshold', '0',
      '-b:v', '2500k',
      '-maxrate', '3000k',
      '-bufsize', '5000k',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000'
    )
  }

  args.push(...HLS_MUXER_ARGS)
  args.push('-hls_segment_filename', `${sessionDir}/seg-%05d.ts`)
  args.push(`${sessionDir}/index.m3u8`)
  return args
}

export function modeForProbe(probe: ProbeResult): StreamMode {
  if (probe.kind === 'hls' && !probe.needsTranscode) return 'direct-hls'
  if (probe.needsTranscode) return 'transcode-reencode'
  return 'transcode-remux'
}