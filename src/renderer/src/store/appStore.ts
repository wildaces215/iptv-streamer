import { create } from 'zustand'
import type {
  Channel,
  ChannelListResult,
  ChannelQuery,
  GroupEntry,
  Playlist,
  StreamEvent,
  StreamStartResult
} from '@shared/types'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'error'

interface PlayerState {
  sessionId: string | null
  channelId: number | null
  playbackUrl: string | null
  mode: string | null
  status: PlayerStatus
  error: string | null
  stderrTail: string[]
}

interface AppStore {
  // list slice
  playlists: Playlist[]
  groups: GroupEntry[]
  channels: Channel[]
  channelsTotal: number
  query: ChannelQuery
  listLoading: boolean

  // player slice — kept separate so list refetches never remount <video>
  player: PlayerState

  loadPlaylists: () => Promise<void>
  loadGroups: () => Promise<void>
  loadChannels: () => Promise<void>
  loadMoreChannels: () => Promise<void>
  setQuery: (patch: Partial<ChannelQuery>) => void
  playChannel: (channelId: number, opts?: { forceTranscode?: boolean }) => Promise<void>
  stopPlayback: () => Promise<void>
  handleStreamEvent: (event: StreamEvent) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  playlists: [],
  groups: [],
  channels: [],
  channelsTotal: 0,
  query: { limit: 200, offset: 0 },
  listLoading: false,
  player: {
    sessionId: null,
    channelId: null,
    playbackUrl: null,
    mode: null,
    status: 'idle',
    error: null,
    stderrTail: []
  },

  loadPlaylists: async () => {
    const playlists = await window.api.playlist.list()
    set({ playlists })
  },

  loadGroups: async () => {
    const groups = await window.api.groups.list(get().query.playlistId ?? undefined)
    set({ groups })
  },

  loadChannels: async () => {
    set({ listLoading: true })
    try {
      const result: ChannelListResult = await window.api.channels.list({
        ...get().query,
        offset: 0
      })
      set({ channels: result.items, channelsTotal: result.total })
    } finally {
      set({ listLoading: false })
    }
  },

  loadMoreChannels: async () => {
    const { channels, channelsTotal, query } = get()
    if (channels.length >= channelsTotal) return
    const result = await window.api.channels.list({ ...query, offset: channels.length })
    set({ channels: [...channels, ...result.items], channelsTotal: result.total })
  },

  setQuery: (patch) => {
    set({ query: { ...get().query, ...patch, offset: 0 } })
    void get().loadChannels()
    if ('playlistId' in patch) void get().loadGroups()
  },

  playChannel: async (channelId, opts) => {
    const player = get().player
    if (player.sessionId) {
      await window.api.stream.stop(player.sessionId).catch(() => {})
    }
    set({
      player: {
        sessionId: null, channelId, playbackUrl: null, mode: null,
        status: 'loading', error: null, stderrTail: []
      }
    })
    try {
      const result: StreamStartResult = await window.api.stream.start({
        channelId,
        forceTranscode: opts?.forceTranscode ?? false
      })
      set({
        player: {
          sessionId: result.sessionId,
          channelId,
          playbackUrl: result.playbackUrl,
          mode: result.mode,
          status: 'playing',
          error: null,
          stderrTail: []
        }
      })
    } catch (err) {
      set({
        player: {
          sessionId: null, channelId, playbackUrl: null, mode: null,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          stderrTail: []
        }
      })
    }
  },

  stopPlayback: async () => {
    const player = get().player
    if (player.sessionId) {
      await window.api.stream.stop(player.sessionId).catch(() => {})
    }
    set({ player: { ...player, sessionId: null, playbackUrl: null, status: 'idle' } })
  },

  handleStreamEvent: (event) => {
    const player = get().player
    if (event.sessionId !== player.sessionId) return
    if (event.type === 'stderr') {
      const stderrTail = [...player.stderrTail, ...event.message?.split(/\r?\n/).filter(Boolean) ?? []]
      set({ player: { ...player, stderrTail: stderrTail.slice(-100) } })
    } else if (event.type === 'error') {
      set({ player: { ...player, status: 'error', error: event.message ?? 'Stream failed' } })
    }
  }
}))