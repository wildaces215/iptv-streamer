import { app, shell, session, BrowserWindow } from 'electron'
import path from 'node:path'
import { openDb, closeDb } from './db/client'
import { registerIpcHandlers } from './ipc/register'
import { registerDialogHandlers } from './dialog'
import { streamManager } from './stream/StreamManager'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: 'IPTV Streamer',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      allowRunningInsecureContent: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Renderer is untrusted: no external navigation, no popups.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.on('before-quit', () => {
  void streamManager.shutdown().then(() => closeDb())
})

app.on('window-all-closed', () => {
  // macOS convention: keep running in the dock until Cmd+Q.
  if (process.platform !== 'darwin') app.quit()
})

app.whenReady().then(async () => {
  await streamManager.recoverFromCrash()
  openDb()

  // Deny every permission request — a video player needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  registerDialogHandlers()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

process.on('SIGINT', () => {
  void streamManager.shutdown().then(() => {
    closeDb()
    app.exit(0)
  })
})
process.on('SIGTERM', () => {
  void streamManager.shutdown().then(() => {
    closeDb()
    app.exit(0)
  })
})