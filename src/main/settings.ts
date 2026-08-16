import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Settings } from './types'

const defaults: Settings = {
  downloadPath: '',
  maxConcurrent: 1,
  scheduleEnabled: false,
  scheduleStartTime: '01:00',
  scheduleEndTime: '06:00',
  preferredBrowser: null
}

let settings: Settings = { ...defaults }

export function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): Settings {
  return settings
}

export function loadSettings(): Settings {
  try {
    if (!defaults.downloadPath) {
      defaults.downloadPath = join(app.getPath('downloads'), 'Hire Downloads')
    }
    settings = { ...defaults, downloadPath: defaults.downloadPath }
    const path = getSettingsPath()
    if (existsSync(path)) {
      settings = { ...settings, ...JSON.parse(readFileSync(path, 'utf-8')) }
    }
    if (!existsSync(settings.downloadPath)) {
      mkdirSync(settings.downloadPath, { recursive: true })
    }
  } catch {
    console.error('Failed to load settings')
  }
  return settings
}

export function saveSettings(): void {
  try {
    writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2))
  } catch (err) {
    console.error('Failed to save settings:', err)
  }
}

export function updateSettings(partial: Partial<Settings>): Settings {
  settings = { ...settings, ...partial }
  saveSettings()
  return settings
}
