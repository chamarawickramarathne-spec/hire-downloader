import { app, BrowserWindow, Notification } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

export function getBinaryPath(name: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'resources', name)
  }
  return join(__dirname, '../../resources', name)
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function showCompleteNotification(filePath: string): void {
  if (!Notification.isSupported()) return
  const fileName = filePath ? filePath.split(/[/\\]/).pop() || 'download' : 'download'
  new Notification({
    title: 'Download Complete',
    body: `${fileName} has been downloaded successfully.`,
    silent: false
  }).show()
}

export function parseSemver(v: string): number[] {
  const clean = v.trim().replace(/^v/i, '').split(/[-+]/)[0]
  return clean.split('.').map((n) => parseInt(n, 10) || 0)
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemver(latest)
  const b = parseSemver(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}
