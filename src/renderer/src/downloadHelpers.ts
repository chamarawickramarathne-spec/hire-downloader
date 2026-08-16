import type { Badge, DownloadItem, DownloadType } from './types'

export function detectType(url: string): DownloadType {
  if (/^(magnet:|udp:|http.*:\/\/.*\.torrent)/i.test(url)) return 'torrent'
  if (/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/i.test(url))
    return 'youtube'
  return 'direct'
}

export function isPlaylistUrl(url: string): boolean {
  return /[?&]list=/i.test(url)
}

export function getBadge(type: DownloadType): Badge {
  if (type === 'youtube') return 'YT'
  if (type === 'torrent') return 'TOR'
  return 'DL'
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function emptyItem(url: string, type: DownloadType): DownloadItem {
  return {
    id: generateId(),
    url,
    type,
    status: 'fetching',
    progress: 0,
    speed: '',
    eta: '',
    title: url,
    thumbnail: '',
    duration: '',
    filePath: '',
    fileName: '',
    error: '',
    badge: getBadge(type),
    formats: [],
    selectedFormat: '',
    totalSize: 0,
    downloadedSize: 0
  }
}

export function startEngine(item: DownloadItem): void {
  if (item.type === 'youtube') {
    window.api.startDownload({ id: item.id, url: item.url, formatId: item.selectedFormat })
  } else if (item.type === 'torrent') {
    window.api.startMagnetDownload({ id: item.id, url: item.url })
  } else {
    window.api.startDirectDownload({ id: item.id, url: item.url })
  }
}
