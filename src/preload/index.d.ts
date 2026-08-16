import { ElectronAPI } from '@electron-toolkit/preload'

interface UpdateInfo {
  has_update: boolean
  current_version: string
  latest_version: string
  download_url: string
  asset_name: string
  size_bytes: number
  release_notes: string
}

interface UpdateProgress {
  stage: 'starting' | 'downloading' | 'complete' | 'error'
  received: number
  total: number
  path?: string
  message?: string
}

interface HireDownloaderAPI {
  fetchInfo: (url: string) => Promise<any>
  fetchPlaylist: (url: string) => Promise<any[]>
  fetchDirectInfo: (url: string) => Promise<any>
  fetchMagnetInfo: (url: string) => Promise<any>
  startDownload: (data: { id: string; url: string; formatId: string }) => Promise<void>
  startDirectDownload: (data: { id: string; url: string }) => Promise<void>
  startMagnetDownload: (data: { id: string; url: string }) => Promise<void>
  cancelDownload: (data: { id: string }) => Promise<void>
  pauseDownload: (data: { id: string }) => Promise<boolean>
  resumeDownload: (data: {
    id: string
    url: string
    type: string
    formatId?: string
  }) => Promise<boolean>

  getDownloadPath: () => Promise<string>
  setDownloadPath: () => Promise<string>
  getMaxConcurrent: () => Promise<number>
  setMaxConcurrent: (value: number) => Promise<number>

  showInFolder: (filePath: string) => Promise<void>

  loadHistory: () => Promise<any[]>
  saveHistory: (history: any[]) => Promise<void>
  clearHistory: () => Promise<void>

  getSchedule: () => Promise<{
    scheduleEnabled: boolean
    scheduleStartTime: string
    scheduleEndTime: string
  }>
  setSchedule: (data: {
    scheduleEnabled: boolean
    scheduleStartTime: string
    scheduleEndTime: string
  }) => Promise<void>

  getAppVersion: () => Promise<string>
  checkForUpdate: () => Promise<UpdateInfo>
  downloadUpdate: (data: { url: string; version: string }) => Promise<string>
  getDownloadedInstaller: () => Promise<string | null>
  installUpdate: (path?: string) => Promise<void>

  onProgress: (
    callback: (data: { id: string; progress: number; speed: string; eta: string }) => void
  ) => () => void
  onComplete: (callback: (data: { id: string; progress: number }) => void) => () => void
  onError: (callback: (data: { id: string; error: string }) => void) => () => void
  onDestination: (callback: (data: { id: string; filePath: string }) => void) => () => void
  onLog: (callback: (data: { id: string; message: string }) => void) => () => void
  onQueueUpdate: (callback: (data: { active: number; queued: number }) => void) => () => void
  onScheduleAction: (callback: (data: { action: 'start' | 'stop' }) => void) => () => void
  onUpdateProgress: (callback: (data: UpdateProgress) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: HireDownloaderAPI
  }
}

export {}
