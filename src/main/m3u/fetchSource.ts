import fs from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import type { ImportProgress } from '@shared/types'
import { IPC_EVENT } from '@shared/ipc-channels'
import { requestFollowingRedirects } from '../http'

const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export interface FetchProgressReporter {
  (progress: ImportProgress): void
}

/** Fetch a playlist source: URL (with progress events) or local file path. */
export async function fetchSource(
  sourceType: 'url' | 'file',
  source: string,
  runId: number,
  reportProgress: FetchProgressReporter
): Promise<string> {
  if (sourceType === 'file') {
    return fs.readFile(source, 'utf8')
  }

  reportProgress({ runId, phase: 'fetching', done: 0, total: 0 })
  const response = await requestFollowingRedirects(source, {
    headersTimeout: 20_000,
    bodyTimeout: 60_000,
    headers: { 'user-agent': DEFAULT_UA, accept: '*/*' }
  })
  if (response.statusCode >= 400) {
    throw new Error(`Playlist download failed: HTTP ${response.statusCode}`)
  }

  let text = ''
  let bytes = 0
  for await (const chunk of response.body) {
    text += String(chunk)
    bytes += String(chunk).length
    if (bytes % (256 * 1024) < 8192) {
      reportProgress({ runId, phase: 'fetching', done: bytes, total: 0 })
    }
  }
  return text
}

/** Emit an import-progress event to all windows. */
export function makeProgressReporter(): {
  report: FetchProgressReporter
  lastRunId: () => number
  cancelRequested: () => boolean
  requestCancel: () => void
} {
  let currentRunId = 0
  let cancelled = false
  return {
    report: (progress) => {
      currentRunId = progress.runId
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC_EVENT.ImportProgress, progress)
      }
    },
    lastRunId: () => currentRunId,
    cancelRequested: () => cancelled,
    requestCancel: () => {
      cancelled = true
    }
  }
}