import { Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { getActiveDownloads } from './downloads'

let tray: Tray | null = null
let showFn: (() => void) | null = null
let quitFn: (() => void) | null = null

export function createTray(onShow: () => void, onQuit: () => void): void {
  showFn = onShow
  quitFn = onQuit
  const iconPath = join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Hire Downloader')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Hire Downloader', click: () => showFn?.() },
      { type: 'separator' },
      { label: 'Exit', click: () => quitFn?.() }
    ])
  )
  tray.on('double-click', () => showFn?.())
  updateTrayTooltip()
}

export function updateTrayTooltip(): void {
  if (!tray || tray.isDestroyed()) return
  const active = getActiveDownloads().size
  tray.setToolTip(
    active > 0
      ? `Hire Downloader — ${active} active download${active > 1 ? 's' : ''}`
      : 'Hire Downloader'
  )
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
