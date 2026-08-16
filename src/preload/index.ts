import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  fetchInfo: (url: string) => ipcRenderer.invoke('ytdlp:fetch-info', url),
  fetchPlaylist: (url: string) => ipcRenderer.invoke('ytdlp:fetch-playlist', url),
  fetchDirectInfo: (url: string) => ipcRenderer.invoke('ytdlp:fetch-direct-info', url),
  fetchMagnetInfo: (url: string) => ipcRenderer.invoke('ytdlp:fetch-magnet-info', url),
  startDownload: (data: { id: string; url: string; formatId: string }) =>
    ipcRenderer.invoke('ytdlp:start-download', data),
  startDirectDownload: (data: { id: string; url: string }) =>
    ipcRenderer.invoke('ytdlp:start-direct-download', data),
  startMagnetDownload: (data: { id: string; url: string }) =>
    ipcRenderer.invoke('ytdlp:start-magnet-download', data),
  cancelDownload: (data: { id: string }) => ipcRenderer.invoke('ytdlp:cancel-download', data),
  pauseDownload: (data: { id: string }) => ipcRenderer.invoke('ytdlp:pause-download', data),
  resumeDownload: (data: { id: string; url: string; type: string; formatId?: string }) =>
    ipcRenderer.invoke('ytdlp:resume-download', data),

  getDownloadPath: () => ipcRenderer.invoke('settings:get-download-path'),
  setDownloadPath: () => ipcRenderer.invoke('settings:set-download-path'),
  getMaxConcurrent: () => ipcRenderer.invoke('settings:get-max-concurrent'),
  setMaxConcurrent: (value: number) => ipcRenderer.invoke('settings:set-max-concurrent', value),

  showInFolder: (filePath: string) => ipcRenderer.invoke('shell:show-in-folder', filePath),

  loadHistory: () => ipcRenderer.invoke('history:load'),
  saveHistory: (history: any[]) => ipcRenderer.invoke('history:save', history),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  getSchedule: () => ipcRenderer.invoke('schedule:get'),
  setSchedule: (data: {
    scheduleEnabled: boolean
    scheduleStartTime: string
    scheduleEndTime: string
  }) => ipcRenderer.invoke('schedule:set', data),

  getAppVersion: () => ipcRenderer.invoke('updater:get-version'),
  checkForUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (data: { url: string; version: string }) =>
    ipcRenderer.invoke('updater:download', data),
  getDownloadedInstaller: () => ipcRenderer.invoke('updater:get-downloaded'),
  installUpdate: (path?: string) => ipcRenderer.invoke('updater:install', path),

  onProgress: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ytdlp:progress', handler)
    return () => ipcRenderer.removeListener('ytdlp:progress', handler)
  },
  onComplete: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ytdlp:complete', handler)
    return () => ipcRenderer.removeListener('ytdlp:complete', handler)
  },
  onError: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ytdlp:error', handler)
    return () => ipcRenderer.removeListener('ytdlp:error', handler)
  },
  onDestination: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ytdlp:destination', handler)
    return () => ipcRenderer.removeListener('ytdlp:destination', handler)
  },
  onLog: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ytdlp:log', handler)
    return () => ipcRenderer.removeListener('ytdlp:log', handler)
  },
  onQueueUpdate: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('ytdlp:queue-update', handler)
    return () => ipcRenderer.removeListener('ytdlp:queue-update', handler)
  },
  onScheduleAction: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('schedule:action', handler)
    return () => ipcRenderer.removeListener('schedule:action', handler)
  },
  onUpdateProgress: (callback: (data: any) => void) => {
    const handler = (_e: any, data: any) => callback(data)
    ipcRenderer.on('updater:progress', handler)
    return () => ipcRenderer.removeListener('updater:progress', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
