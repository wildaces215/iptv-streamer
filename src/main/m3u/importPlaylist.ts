import type { ImportPreview, ImportResult, ImportRunOptions } from '@shared/types'
import { createPlaylist, getPlaylist, getPlaylistByName, touchPlaylistImported } from '../db/repositories/playlistRepo'
import { upsertImportedDrafts } from '../db/repositories/channelRepo'
import { fetchSource, makeProgressReporter } from './fetchSource'
import { parseM3u } from './parse'

export interface ImportHandle {
  run: (opts: ImportRunOptions, runId: number) => Promise<ImportResult>
  cancel: () => void
}

const handle = makeProgressReporter()

export function getImportHandle(): ImportHandle {
  return { run: runImport, cancel: () => handle.requestCancel() }
}

export async function runImport(opts: ImportRunOptions, runId: number): Promise<ImportResult> {
  const startedAt = Date.now()
  const warnings: string[] = []
  const runIdFinal = runId

  handle.report({ runId: runIdFinal, phase: 'fetching', done: 0, total: 0 })
  const text = await fetchSource(opts.sourceType, opts.source, runIdFinal, handle.report)

  if (handle.cancelRequested()) throw new Error('Import cancelled')

  handle.report({ runId: runIdFinal, phase: 'parsing', done: 0, total: 0 })
  const { epgUrl, drafts } = parseM3u(text)
  if (drafts.length === 0) throw new Error('Playlist contained no channels')

  // Resolve or create the target playlist.
  let playlistId = opts.playlistId
  if (!playlistId) {
    const existing = getPlaylistByName(opts.name)
    playlistId = existing?.id ?? createPlaylist({
      name: opts.name,
      sourceType: opts.sourceType,
      sourceUrl: opts.sourceType === 'url' ? opts.source : null,
      sourcePath: opts.sourceType === 'file' ? opts.source : null
    }).id
  } else if (!getPlaylist(playlistId)) {
    throw new Error(`Playlist ${playlistId} does not exist`)
  }

  handle.report({ runId: runIdFinal, phase: 'writing', done: 0, total: drafts.length })
  const { inserted, updated, skipped, pruned } = upsertImportedDrafts(
    playlistId,
    drafts,
    opts.pruneMissing ?? false
  )
  touchPlaylistImported(playlistId, epgUrl, null)

  return {
    playlistId,
    parsed: drafts.length,
    inserted,
    updated,
    skipped,
    pruned,
    durationMs: Date.now() - startedAt,
    warnings
  }
}

export async function previewImport(
  sourceType: 'url' | 'file',
  source: string
): Promise<ImportPreview> {
  const text = await fetchSource(sourceType, source, -1, () => {})
  const { epgUrl, drafts, duplicateCount } = parseM3u(text)
  return { count: drafts.length, duplicateCount, sample: drafts.slice(0, 5), epgUrl }
}