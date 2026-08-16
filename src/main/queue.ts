import type { QueueJob } from './types'
import { getSettings } from './settings'
import { getActiveDownloads, setQueuedCount } from './downloads'
import { startYtDlpDownload } from './ytdlp'
import { startDirectDownload } from './direct'
import { startMagnetDownload } from './torrent'

const queue: QueueJob[] = []
const pendingIds = new Set<string>()
const startingIds = new Set<string>()

function runJob(job: QueueJob): void {
  pendingIds.delete(job.id)
  startingIds.add(job.id)
  if (job.type === 'youtube') {
    startYtDlpDownload(job.id, job.url, job.formatId || 'best', true, !!job.resume)
    startingIds.delete(job.id)
  } else if (job.type === 'torrent') {
    void startMagnetDownload(job.id, job.url, !!job.resume).finally(() => {
      startingIds.delete(job.id)
      processQueue()
    })
  } else {
    startDirectDownload(job.id, job.url, !!job.resume)
    startingIds.delete(job.id)
  }
}

export function processQueue(): void {
  const max = getSettings().maxConcurrent
  const used = getActiveDownloads().size + startingIds.size
  let slots = Math.max(0, max - used)
  while (slots > 0 && queue.length > 0) {
    const job = queue.shift()!
    setQueuedCount(queue.length)
    runJob(job)
    slots = Math.max(0, max - (getActiveDownloads().size + startingIds.size))
  }
  setQueuedCount(queue.length)
}

export function enqueue(job: QueueJob): void {
  if (getActiveDownloads().has(job.id) || startingIds.has(job.id)) return
  const idx = queue.findIndex((j) => j.id === job.id)
  if (idx !== -1) queue[idx] = job
  else {
    queue.push(job)
    pendingIds.add(job.id)
  }
  setQueuedCount(queue.length)
  processQueue()
}

export function removeFromQueue(id: string): boolean {
  const idx = queue.findIndex((j) => j.id === id)
  if (idx === -1) {
    startingIds.delete(id)
    return false
  }
  queue.splice(idx, 1)
  pendingIds.delete(id)
  setQueuedCount(queue.length)
  return true
}

export function clearQueue(): void {
  queue.length = 0
  pendingIds.clear()
  startingIds.clear()
  setQueuedCount(0)
}

export function onJobFinished(id: string): void {
  pendingIds.delete(id)
  startingIds.delete(id)
  processQueue()
}
