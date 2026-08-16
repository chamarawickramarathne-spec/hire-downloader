import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { HistoryItem } from './types'

export function getHistoryPath(): string {
  return join(app.getPath('userData'), 'history.json')
}

export function loadHistory(): HistoryItem[] {
  try {
    const path = getHistoryPath()
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    console.error('Failed to load history')
  }
  return []
}

export function saveHistory(history: HistoryItem[]): void {
  try {
    writeFileSync(getHistoryPath(), JSON.stringify(history, null, 2))
  } catch (err) {
    console.error('Failed to save history:', err)
  }
}
