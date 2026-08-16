import { sendToRenderer } from './util'

export type ActiveHandle = {
  kill?: () => void
  destroy?: () => void
  pause?: () => void
  resume?: () => void
  kind?: 'proc' | 'http' | 'torrent'
}

const activeDownloads = new Map<string, ActiveHandle>()

export function getActiveDownloads(): Map<string, ActiveHandle> {
  return activeDownloads
}

export function setActive(id: string, handle: ActiveHandle): void {
  activeDownloads.set(id, handle)
  sendToRenderer('ytdlp:queue-update', {
    active: activeDownloads.size,
    queued: getQueuedCount()
  })
}

export function removeActive(id: string): void {
  activeDownloads.delete(id)
}

export function killActive(id: string): boolean {
  const active = activeDownloads.get(id)
  if (!active) return false
  try {
    if (typeof active.kill === 'function') active.kill()
    else if (typeof active.destroy === 'function') active.destroy()
  } catch {
    /* ignore */
  }
  activeDownloads.delete(id)
  return true
}

export function pauseActive(id: string): boolean {
  const active = activeDownloads.get(id)
  if (!active) return false
  if (typeof active.pause === 'function') {
    active.pause()
    return true
  }
  if (typeof active.kill === 'function') {
    active.kill()
    activeDownloads.delete(id)
    return true
  }
  return false
}

export function resumeActive(id: string): boolean {
  const active = activeDownloads.get(id)
  if (!active || typeof active.resume !== 'function') return false
  active.resume()
  return true
}

let queuedCount = 0

export function setQueuedCount(n: number): void {
  queuedCount = n
  sendToRenderer('ytdlp:queue-update', {
    active: activeDownloads.size,
    queued: queuedCount
  })
}

export function getQueuedCount(): number {
  return queuedCount
}

export function stopAllDownloads(): void {
  for (const [id] of activeDownloads) {
    killActive(id)
  }
  activeDownloads.clear()
}
