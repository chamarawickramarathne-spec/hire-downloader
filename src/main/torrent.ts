import { join } from 'path'
import { getSettings } from './settings'
import { formatBytes, formatDuration, sendToRenderer, showCompleteNotification } from './util'
import { setActive, removeActive } from './downloads'
import { onJobFinished } from './queue'

let clientPromise: Promise<any> | null = null
const torrentsById = new Map<string, any>()

async function getClient(): Promise<any> {
  if (!clientPromise) {
    clientPromise = import('webtorrent').then(({ default: WebTorrent }) => new (WebTorrent as any)())
  }
  return clientPromise
}

export async function destroyTorrentClient(): Promise<void> {
  if (!clientPromise) return
  try {
    const client = await clientPromise
    await client.destroy()
  } catch {
    /* */
  }
  clientPromise = null
  torrentsById.clear()
}

export async function fetchMagnetInfo(url: string): Promise<any> {
  const client = await getClient()
  const torrent: any = await new Promise((resolve, reject) => {
    const t = client.add(url, { destroyStoreOnDestroy: true })
    const timeout = setTimeout(() => reject(new Error('Torrent metadata timed out (30s)')), 30000)
    t.on('ready', () => {
      clearTimeout(timeout)
      resolve(t)
    })
    t.on('error', (err: any) => {
      clearTimeout(timeout)
      reject(new Error(String(err?.message || err || 'Torrent error')))
    })
  })

  const files = torrent.files.map((f: any) => ({ name: f.name, length: f.length }))
  const totalSize = files.reduce((sum: number, f: any) => sum + f.length, 0)
  const result = {
    title: torrent.name || 'Torrent',
    thumbnail: '',
    duration: '',
    totalSize,
    files,
    torrentName: torrent.name
  }
  torrent.destroy()
  return result
}

export async function startMagnetDownload(id: string, magnetUri: string, resume = false): Promise<void> {
  try {
    const client = await getClient()
    const settings = getSettings()

    const existing = torrentsById.get(id)
    if (existing && resume) {
      existing.resume()
      setActive(id, {
        kind: 'torrent',
        pause: () => existing.pause(),
        resume: () => existing.resume(),
        destroy: () => {
          try {
            existing.destroy()
          } catch {
            /* */
          }
          torrentsById.delete(id)
        },
        kill: () => {
          try {
            existing.destroy()
          } catch {
            /* */
          }
          torrentsById.delete(id)
        }
      })
      return
    }

    const torrent: any = await new Promise((resolve, reject) => {
      const t = client.add(magnetUri, { path: settings.downloadPath })
      const timeout = setTimeout(() => reject(new Error('Torrent connection timed out')), 60000)
      t.on('ready', () => {
        clearTimeout(timeout)
        resolve(t)
      })
      t.on('error', (err: any) => {
        clearTimeout(timeout)
        reject(new Error(String(err?.message || err || 'Torrent error')))
      })
    })

    torrentsById.set(id, torrent)
    setActive(id, {
      kind: 'torrent',
      pause: () => torrent.pause(),
      resume: () => torrent.resume(),
      destroy: () => {
        try {
          torrent.destroy()
        } catch {
          /* */
        }
        torrentsById.delete(id)
      },
      kill: () => {
        try {
          torrent.destroy()
        } catch {
          /* */
        }
        torrentsById.delete(id)
      }
    })

    sendToRenderer('ytdlp:destination', {
      id,
      filePath: join(settings.downloadPath, torrent.name)
    })

    torrent.on('download', () => {
      const progress = torrent.progress * 100
      const speed = formatBytes(torrent.downloadSpeed) + '/s'
      const remaining = torrent.timeRemaining
      const eta = remaining > 0 ? formatDuration(remaining / 1000) : '∞'
      sendToRenderer('ytdlp:progress', {
        id,
        progress: Math.round(progress * 10) / 10,
        speed,
        eta
      })
    })

    torrent.on('done', () => {
      removeActive(id)
      torrentsById.delete(id)
      sendToRenderer('ytdlp:complete', { id, progress: 100 })
      showCompleteNotification(join(settings.downloadPath, torrent.name))
      onJobFinished(id)
      try {
        torrent.destroy()
      } catch {
        /* */
      }
    })

    torrent.on('error', (err: any) => {
      removeActive(id)
      torrentsById.delete(id)
      sendToRenderer('ytdlp:error', { id, error: String(err?.message || err || 'Torrent error') })
      onJobFinished(id)
    })
  } catch (err: any) {
    removeActive(id)
    sendToRenderer('ytdlp:error', {
      id,
      error: String(err?.message || err || 'Failed to start torrent')
    })
    onJobFinished(id)
  }
}
