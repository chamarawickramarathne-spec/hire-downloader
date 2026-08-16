import { getSettings } from './settings'
import { getActiveDownloads, killActive, stopAllDownloads } from './downloads'
import { clearQueue, processQueue } from './queue'
import { sendToRenderer } from './util'

let scheduleTimer: ReturnType<typeof setInterval> | null = null
let lastScheduleTrigger = ''

function getCurrentHHMM(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function checkSchedule(): void {
  const settings = getSettings()
  if (!settings.scheduleEnabled) return
  const current = getCurrentHHMM()
  if (current === lastScheduleTrigger) return

  if (current === settings.scheduleStartTime) {
    lastScheduleTrigger = current
    sendToRenderer('schedule:action', { action: 'start' })
  } else if (current === settings.scheduleEndTime) {
    lastScheduleTrigger = current
    for (const [id] of getActiveDownloads()) {
      killActive(id)
      sendToRenderer('ytdlp:error', { id, error: 'Stopped by schedule' })
    }
    clearQueue()
    processQueue()
    sendToRenderer('schedule:action', { action: 'stop' })
  }
}

export function startScheduleTimer(): void {
  if (scheduleTimer) return
  scheduleTimer = setInterval(checkSchedule, 30000)
}

export function stopScheduleTimer(): void {
  if (scheduleTimer) {
    clearInterval(scheduleTimer)
    scheduleTimer = null
  }
}

export function resetScheduleTrigger(): void {
  lastScheduleTrigger = ''
}

export function stopScheduledDownloads(): void {
  stopAllDownloads()
  clearQueue()
}
