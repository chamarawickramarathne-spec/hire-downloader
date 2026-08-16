import { ipcMain, dialog, shell } from 'electron'
import { getMainWindow } from './util'
import { getSettings, updateSettings } from './settings'
import { loadHistory, saveHistory } from './history'
import { enqueue, removeFromQueue, processQueue } from './queue'
import { killActive, pauseActive, resumeActive, getActiveDownloads } from './downloads'
import { fetchYtDlpInfo, fetchPlaylistInfo } from './ytdlp'
import { fetchDirectInfo } from './direct'
import { fetchMagnetInfo } from './torrent'
import {
  checkForUpdate,
  downloadUpdate,
  getAppVersion,
  getDownloadedInstaller,
  installUpdate
} from './updater'
import { resetScheduleTrigger } from './schedule'

export function registerIPC(): void {
  ipcMain.handle('ytdlp:fetch-info', async (_e, url: string) => fetchYtDlpInfo(url))
  ipcMain.handle('ytdlp:fetch-playlist', async (_e, url: string) => fetchPlaylistInfo(url))
  ipcMain.handle('ytdlp:fetch-direct-info', async (_e, url: string) => fetchDirectInfo(url))
  ipcMain.handle('ytdlp:fetch-magnet-info', async (_e, url: string) => fetchMagnetInfo(url))

  ipcMain.handle('ytdlp:start-download', (_e, data: { id: string; url: string; formatId: string }) => {
    enqueue({ id: data.id, type: 'youtube', url: data.url, formatId: data.formatId })
  })
  ipcMain.handle('ytdlp:start-direct-download', (_e, data: { id: string; url: string }) => {
    enqueue({ id: data.id, type: 'direct', url: data.url })
  })
  ipcMain.handle('ytdlp:start-magnet-download', (_e, data: { id: string; url: string }) => {
    enqueue({ id: data.id, type: 'torrent', url: data.url })
  })

  ipcMain.handle('ytdlp:cancel-download', (_e, data: { id: string }) => {
    removeFromQueue(data.id)
    killActive(data.id)
    processQueue()
  })

  ipcMain.handle('ytdlp:pause-download', (_e, data: { id: string }) => {
    const ok = pauseActive(data.id)
    processQueue()
    return ok
  })

  ipcMain.handle('ytdlp:resume-download', (_e, data: { id: string; url: string; type: string; formatId?: string }) => {
    if (resumeActive(data.id)) return true
    if (data.type === 'youtube') {
      enqueue({ id: data.id, type: 'youtube', url: data.url, formatId: data.formatId, resume: true })
    } else if (data.type === 'torrent') {
      enqueue({ id: data.id, type: 'torrent', url: data.url, resume: true })
    } else {
      enqueue({ id: data.id, type: 'direct', url: data.url, resume: true })
    }
    return true
  })

  ipcMain.handle('settings:get-download-path', () => getSettings().downloadPath)
  ipcMain.handle('settings:set-download-path', async () => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Download Directory'
    })
    if (!result.canceled && result.filePaths[0]) {
      updateSettings({ downloadPath: result.filePaths[0] })
    }
    return getSettings().downloadPath
  })
  ipcMain.handle('settings:get-max-concurrent', () => getSettings().maxConcurrent)
  ipcMain.handle('settings:set-max-concurrent', (_e, value: number) => {
    updateSettings({ maxConcurrent: Math.max(1, Math.min(10, value)) })
    processQueue()
    return getSettings().maxConcurrent
  })

  ipcMain.handle('shell:show-in-folder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('history:load', () => loadHistory())
  ipcMain.handle('history:save', (_e, history) => saveHistory(history))
  ipcMain.handle('history:clear', () => saveHistory([]))

  ipcMain.handle('schedule:get', () => {
    const s = getSettings()
    return {
      scheduleEnabled: s.scheduleEnabled,
      scheduleStartTime: s.scheduleStartTime,
      scheduleEndTime: s.scheduleEndTime
    }
  })
  ipcMain.handle(
    'schedule:set',
    (
      _e,
      data: { scheduleEnabled: boolean; scheduleStartTime: string; scheduleEndTime: string }
    ) => {
      updateSettings(data)
      resetScheduleTrigger()
      return data
    }
  )

  ipcMain.handle('updater:get-version', () => getAppVersion())
  ipcMain.handle('updater:check', () => checkForUpdate())
  ipcMain.handle('updater:download', (_e, data: { url: string; version: string }) =>
    downloadUpdate(data.url, data.version)
  )
  ipcMain.handle('updater:get-downloaded', () => getDownloadedInstaller())
  ipcMain.handle('updater:install', (_e, path?: string) => installUpdate(path))

  ipcMain.handle('downloads:active-count', () => getActiveDownloads().size)
}
