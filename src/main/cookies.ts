import { spawn } from 'child_process'
import { getSettings, updateSettings } from './settings'

async function probeBrowser(ytdlpPath: string, browser: string): Promise<boolean> {
  const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'
  return new Promise((resolve) => {
    const args = [
      '--cookies-from-browser',
      browser,
      '--dump-single-json',
      '--no-playlist',
      '--no-warnings',
      '--extractor-args',
      'youtube:player_client=ios,web',
      testUrl
    ]
    const proc = spawn(ytdlpPath, args)
    const t = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        /* */
      }
      resolve(false)
    }, 12000)
    proc.on('close', (code) => {
      clearTimeout(t)
      resolve(code === 0)
    })
    proc.on('error', () => {
      clearTimeout(t)
      resolve(false)
    })
  })
}

export async function getWorkingCookies(ytdlpPath: string): Promise<string | null> {
  const settings = getSettings()
  const order = ['edge', 'chrome', 'brave', 'vivaldi', 'firefox']
  const preferred = settings.preferredBrowser
  const browsers = preferred ? [preferred, ...order.filter((b) => b !== preferred)] : order

  for (const browser of browsers) {
    if (await probeBrowser(ytdlpPath, browser)) {
      if (settings.preferredBrowser !== browser) updateSettings({ preferredBrowser: browser })
      return browser
    }
  }
  return null
}
