import { dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'

export function registerDialogHandlers(): void {
  ipcMain.handle(IPC.DialogPickFile, async (_event, opts: { filters?: { name: string; extensions: string[] }[] }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: opts?.filters ?? [{ name: 'Playlists', extensions: ['m3u', 'm3u8'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}