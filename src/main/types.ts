export interface FormatOption {
  formatId: string
  label: string
  ext: string
  resolution: string
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
  preferredBrowser: string | null
}

export type JobType = 'youtube' | 'direct' | 'torrent'

export interface QueueJob {
  id: string
  type: JobType
  url: string
  formatId?: string
  resume?: boolean
}

export interface UpdateInfo {
  has_update: boolean
  current_version: string
  latest_version: string
  download_url: string
  asset_name: string
  size_bytes: number
  release_notes: string
}

export interface UpdateProgress {
  stage: 'starting' | 'downloading' | 'complete' | 'error'
  received: number
  total: number
  path?: string
  message?: string
}
