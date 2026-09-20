import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_EVENT } from '@shared/ipc-channels'
import type {
  Channel,
  ChannelListResult,
  ChannelQuery,
  GroupEntry,
  ImportPreview,
  ImportResult,
  ImportRunOptions,
  Playlist,
  ProbeResult,
  StreamEvent,
  StreamStartResult,
  StreamStatus
} from '@shared/types'

const api = {
  playlist: {
    list: (): Promise<Playlist[]> => ipcRenderer.invoke(IPC.PlaylistList),
    create: (input: { name: string; sourceType: 'url' | 'file' | 'manual'; sourceUrl?: string | null; sourcePath?: string | null }): Promise<Playlist> =>
      ipcRenderer.invoke(IPC.PlaylistCreate, input),
    update: (input: { id: number; patch: { name?: string; epgUrl?: string | null; userAgent?: string | null } }): Promise<Playlist | null> =>
      ipcRenderer.invoke(IPC.PlaylistUpdate, input),
    remove: (id: number): Promise<number> =>
      ipcRenderer.invoke(IPC.PlaylistDelete, { id })
  },
  channels: {
    list: (query: ChannelQuery): Promise<ChannelListResult> =>
      ipcRenderer.invoke(IPC.ChannelList, query),
    get: (id: number): Promise<Channel | null> => ipcRenderer.invoke(IPC.ChannelGet, { id }),
    create: (input: {
      playlistId?: number | null
      name: string
      url: string
      groupName?: string | null
      logoUrl?: string | null
    }): Promise<Channel> => ipcRenderer.invoke(IPC.ChannelCreate, input),
    update: (input: {
      id: number
      patch: {
        name?: string
        url?: string
        groupName?: string | null
        logoUrl?: string | null
        isHidden?: boolean
        sortOrder?: number
      }
    }): Promise<Channel | null> => ipcRenderer.invoke(IPC.ChannelUpdate, input),
    remove: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC.ChannelDelete, { id }),
    favorite: (id: number, value: boolean): Promise<Channel | null> =>
      ipcRenderer.invoke(IPC.ChannelFavorite, { id, value })
  },
  groups: {
    list: (playlistId?: number): Promise<GroupEntry[]> =>
      ipcRenderer.invoke(IPC.GroupList, { playlistId })
  },
  import: {
    preview: (input: { sourceType: 'url' | 'file'; source: string }): Promise<ImportPreview> =>
      ipcRenderer.invoke(IPC.ImportPreview, input),
    run: (opts: ImportRunOptions): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.ImportRun, opts),
    cancel: (): Promise<void> => ipcRenderer.invoke(IPC.ImportCancel)
  },
  stream: {
    probe: (channelId: number): Promise<ProbeResult | null> =>
      ipcRenderer.invoke(IPC.StreamProbe, { channelId }),
    start: (input: { channelId: number; forceTranscode?: boolean }): Promise<StreamStartResult> =>
      ipcRenderer.invoke(IPC.StreamStart, input),
    stop: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.StreamStop, { sessionId }),
    status: (): Promise<StreamStatus> => ipcRenderer.invoke(IPC.StreamStatus)
  },
  app: {
    capabilities: (): Promise<unknown> => ipcRenderer.invoke(IPC.AppCapabilities),
    pickFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
      ipcRenderer.invoke(IPC.DialogPickFile, { filters }),
    getSetting: (key: string): Promise<unknown> => ipcRenderer.invoke(IPC.SettingsGet, { key }),
    setSetting: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke(IPC.SettingsSet, { key, value })
  },
  onStreamEvent: (callback: (event: StreamEvent) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, event: StreamEvent): void => callback(event)
    ipcRenderer.on(IPC_EVENT.StreamEvent, handler)
    return () => ipcRenderer.off(IPC_EVENT.StreamEvent, handler)
  },
  onImportProgress: (callback: (progress: unknown) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, progress: unknown): void => callback(progress)
    ipcRenderer.on(IPC_EVENT.ImportProgress, handler)
    return () => ipcRenderer.off(IPC_EVENT.ImportProgress, handler)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)