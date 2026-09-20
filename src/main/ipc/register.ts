import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc-channels'
import type {
  Channel,
  ChannelListResult,
  ChannelQuery,
  GroupEntry,
  ImportPreview,
  ImportResult,
  StreamStartResult,
  StreamStatus
} from '@shared/types'
import * as playlistRepo from '../db/repositories/playlistRepo'
import * as channelRepo from '../db/repositories/channelRepo'
import { getSetting, setSetting } from '../db/repositories/settingsRepo'
import { getImportHandle, previewImport } from '../m3u/importPlaylist'
import { streamManager } from '../stream/StreamManager'
import { getAppCapabilities } from '../capabilities'
import {
  channelCreateSchema,
  channelQuerySchema,
  channelUpdateSchema,
  importPreviewSchema,
  importRunSchema,
  idSchema,
  playlistCreateSchema,
  playlistUpdateSchema,
  settingsSetSchema,
  streamStartSchema
} from '@shared/api-contract'

/**
 * Register an ipcMain.handle with zod-validated payloads. The schema's
 * inferred type flows into the handler, so payloads are fully typed.
 */
function handle<S extends z.ZodType>(
  name: string,
  schema: S | null,
  fn: (payload: S extends z.ZodType ? z.infer<S> : undefined) => unknown
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ipcMain.handle(name, async (_event, payload) => fn(schema ? (schema.parse(payload) as any) : (undefined as any)))
}

let importRunId = 0

export function registerIpcHandlers(): void {
  // ---- playlists ----
  handle(IPC.PlaylistList, null, () => playlistRepo.listPlaylists())
  handle(IPC.PlaylistCreate, playlistCreateSchema, (input) =>
    playlistRepo.createPlaylist(input)
  )
  handle(IPC.PlaylistUpdate, playlistUpdateSchema, ({ id, patch }) =>
    playlistRepo.updatePlaylist(id, patch)
  )
  handle(IPC.PlaylistDelete, z.object({ id: idSchema }), ({ id }) =>
    playlistRepo.deletePlaylist(id)
  )

  // ---- channels ----
  handle(IPC.ChannelList, channelQuerySchema, (query: ChannelQuery): ChannelListResult =>
    channelRepo.listChannels(query)
  )
  handle(IPC.ChannelGet, z.object({ id: idSchema }), ({ id }): Channel | null =>
    channelRepo.getChannel(id)
  )
  handle(IPC.ChannelCreate, channelCreateSchema, (input): Channel =>
    channelRepo.createChannel({ ...input, manualOverride: true })
  )
  handle(IPC.ChannelUpdate, channelUpdateSchema, ({ id, patch }): Channel | null =>
    channelRepo.updateChannel(id, { ...patch, markManualOverride: true })
  )
  handle(IPC.ChannelDelete, z.object({ id: idSchema }), ({ id }): boolean =>
    channelRepo.deleteChannel(id)
  )
  handle(
    IPC.ChannelFavorite,
    z.object({ id: idSchema, value: z.boolean() }),
    ({ id, value }): Channel | null => channelRepo.setChannelFavorite(id, value)
  )
  handle(IPC.GroupList, z.object({ playlistId: idSchema.optional() }), ({ playlistId }): GroupEntry[] =>
    channelRepo.listGroups(playlistId)
  )

  // ---- import ----
  handle(IPC.ImportPreview, importPreviewSchema, async ({ sourceType, source }): Promise<ImportPreview> =>
    previewImport(sourceType, source)
  )
  handle(IPC.ImportRun, importRunSchema, async (opts): Promise<ImportResult> => {
    importRunId += 1
    return getImportHandle().run(opts, importRunId)
  })
  handle(IPC.ImportCancel, null, () => getImportHandle().cancel())

  // ---- streaming ----
  handle(IPC.StreamProbe, z.object({ channelId: idSchema }), async ({ channelId }) =>
    streamManager.probeChannel(channelId)
  )
  handle(IPC.StreamStart, streamStartSchema, async (opts): Promise<StreamStartResult> =>
    streamManager.start(opts.channelId, { forceTranscode: opts.forceTranscode })
  )
  handle(IPC.StreamStop, z.object({ sessionId: z.string().uuid() }), ({ sessionId }) =>
    streamManager.stop(sessionId)
  )
  handle(IPC.StreamStatus, null, (): StreamStatus => streamManager.getStatus())

  // ---- misc ----
  handle(IPC.AppCapabilities, null, () => getAppCapabilities())
  handle(IPC.SettingsGet, z.object({ key: z.string() }), ({ key }) => getSetting(key))
  handle(IPC.SettingsSet, settingsSetSchema, ({ key, value }) => setSetting(key, value))
}