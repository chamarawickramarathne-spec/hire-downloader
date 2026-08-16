export type DownloadType = 'youtube' | 'torrent' | 'direct'
export type DownloadStatus = 'fetching' | 'ready' | 'downloading' | 'completed' | 'error' | 'paused' | 'queued'
export type Badge = 'YT' | 'TOR' | 'DL'

export interface FormatOption {
  formatId: string
  label: string
  ext: string
  resolution: string
}

export interface DownloadItem {
  id: string
  url: string
  type: DownloadType
  status: DownloadStatus
  progress: number
  speed: string
  eta: string
  title: string
  thumbnail: string
  duration: string
  filePath: string
  fileName: string
  error: string
  badge: Badge
  formats: FormatOption[]
  selectedFormat: string
  totalSize: number
  downloadedSize: number
}

export interface HistoryItem {
  id: string
  url: string
  type: string
  title: string
  thumbnail: string
  filePath: string
  fileName: string
  completedAt: string
  badge: string
}

export interface Settings {
  downloadPath: string
  maxConcurrent: number
  scheduleEnabled: boolean
  scheduleStartTime: string
  scheduleEndTime: string
}
