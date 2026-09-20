export type PlaylistSourceType = 'url' | 'file' | 'manual'

export interface Playlist {
  id: number
  name: string
  sourceType: PlaylistSourceType
  sourceUrl: string | null
  sourcePath: string | null
  epgUrl: string | null
  userAgent: string | null
  channelCount: number
  lastImportedAt: number | null
  createdAt: number
  updatedAt: number
}

export type StreamKind = 'hls' | 'ts' | 'other'

export interface Channel {
  id: number
  playlistId: number | null
  name: string
  url: string
  groupName: string | null
  logoUrl: string | null
  tvgId: string | null
  tvgName: string | null
  userAgent: string | null
  referrer: string | null
  kind: StreamKind | null
  needsTranscode: 0 | 1 | null
  probeCheckedAt: number | null
  isFavorite: boolean
  isHidden: boolean
  manualOverride: boolean
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface ChannelQuery {
  search?: string
  group?: string
  playlistId?: number | null
  favoritesOnly?: boolean
  limit?: number
  offset?: number
}

export interface ChannelListResult {
  items: Channel[]
  total: number
}

export interface GroupEntry {
  name: string
  count: number
}

export interface ChannelDraft {
  name: string
  url: string
  groupName: string | null
  logoUrl: string | null
  tvgId: string | null
  tvgName: string | null
  userAgent: string | null
  referrer: string | null
}

export interface ImportPreview {
  count: number
  duplicateCount: number
  sample: ChannelDraft[]
  epgUrl: string | null
}

export interface ImportResult {
  playlistId: number
  parsed: number
  inserted: number
  updated: number
  skipped: number
  pruned: number
  durationMs: number
  warnings: string[]
}

export interface ProbeResult {
  kind: StreamKind
  needsTranscode: boolean
  videoCodec: string | null
  audioCodec: string | null
  container: string | null
  probedVia: 'ffprobe' | 'extension' | 'cache' | 'content-type' | 'unknown'
}

export type StreamMode = 'direct-hls' | 'transcode-remux' | 'transcode-reencode'

export interface StreamStartResult {
  sessionId: string
  channelId: number
  playbackUrl: string
  mode: StreamMode
  probe: ProbeResult
}

export interface StreamSessionInfo {
  sessionId: string
  channelId: number
  mode: StreamMode
  startedAt: number
  lastRequestAt: number
  bytesServed: number
}

export interface StreamStatus {
  sessions: StreamSessionInfo[]
  serverPort: number
}

export type StreamEventType =
  | 'spawned'
  | 'ready'
  | 'stalled'
  | 'stderr'
  | 'exit'
  | 'error'

export interface StreamEvent {
  sessionId: string
  type: StreamEventType
  code?: number
  message?: string
}

export type ImportPhase = 'fetching' | 'parsing' | 'writing'

export interface ImportProgress {
  runId: number
  phase: ImportPhase
  done: number
  total: number
}

export interface FfmpegInfo {
  available: boolean
  path: string | null
  source: 'env' | 'packaged' | 'system-path' | 'none'
  version: string | null
  probeAvailable: boolean
}

export interface AppCapabilities {
  platform: string
  appVersion: string
  ffmpeg: FfmpegInfo
}

export interface ImportRunOptions {
  name: string
  sourceType: 'url' | 'file'
  source: string
  playlistId?: number
  pruneMissing?: boolean
}

export interface AppSettings {
  [key: string]: unknown
}