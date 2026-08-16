import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setMainWindow, getMainWindow } from './util'
import { loadSettings } from './settings'
import { registerIPC } from './ipc'
import { createTray, destroyTray, updateTrayTooltip } from './tray'
import { startScheduleTimer, stopScheduleTimer } from './schedule'
import { getActiveDownloads, stopAllDownloads } from './downloads'
import { clearQueue } from './queue'
import { destroyTorrentClient } from './torrent'

let isQuitting = false

function showMainWindow(): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
  }
}

async function quitApp(): Promise<void> {
  isQuitting = true
  stopScheduleTimer()
  stopAllDownloads()
  clearQueue()
  await destroyTorrentClient()
  destroyTray()
  app.quit()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.on('close', async (event) => {
    if (isQuitting) return
    event.preventDefault()
    const active = getActiveDownloads().size
    if (active > 0) {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Minimize to Tray', 'Quit & Stop Downloads'],
        defaultId: 0,
        title: 'Downloads Active',
        message: `${active} download(s) still running.`,
        detail: 'Minimize to tray to continue downloading, or quit and stop all downloads.'
      })
      if (result.response === 1) await quitApp()
    } else {
      mainWindow.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hire-downloader')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  loadSettings()
  registerIPC()
  createWindow()
  createTray(showMainWindow, () => {
    void quitApp()
  })
  startScheduleTimer()
  setInterval(updateTrayTooltip, 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  /* keep tray */
})
