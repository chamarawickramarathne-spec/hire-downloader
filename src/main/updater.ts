import { app, dialog, shell } from 'electron'
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as https from 'https'
import * as http from 'http'
import type { UpdateInfo, UpdateProgress } from './types'
import { getMainWindow, isNewerVersion, sendToRenderer } from './util'

const OWNER = 'chamarawickramarathne-spec'
const REPO = 'hire-downloader'
const ASSET_NAME = 'HireDownloader-Setup.exe'
const UA = 'HireDownloader-Updater/1.0'

function updatesDir(): string {
  const dir = join(app.getPath('userData'), 'updates')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function installerPath(): string {
  return join(updatesDir(), ASSET_NAME)
}

function metaPath(): string {
  return join(updatesDir(), 'update.json')
}

function httpGet(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const doReq = (target: string, redirects = 0): void => {
      if (redirects > 8) {
        reject(new Error('Too many redirects'))
        return
      }
      const proto = target.startsWith('https') ? https : http
      proto
        .get(target, { headers: { 'User-Agent': UA, ...headers } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            doReq(res.headers.location, redirects + 1)
            return
          }
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c) => {
            body += c
          })
          res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers }))
        })
        .on('error', reject)
    }
    doReq(url)
  })
}

function githubError(status: number): string {
  if (status === 403 || status === 429) return 'GitHub API rate limit reached — try again in a few minutes'
  return `GitHub error HTTP ${status}`
}

async function checkViaApi(current: string): Promise<UpdateInfo> {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
  const res = await httpGet(url, { Accept: 'application/vnd.github+json' })
  if (res.status !== 200) throw new Error(githubError(res.status))
  const data = JSON.parse(res.body)
  const tag = String(data.tag_name || '').replace(/^v/i, '')
  const assets: any[] = data.assets || []
  const asset = assets.find((a) => a.name === ASSET_NAME)
  if (!asset) throw new Error(`Release asset ${ASSET_NAME} not found`)
  return {
    has_update: isNewerVersion(tag, current),
    current_version: current,
    latest_version: tag,
    download_url: asset.browser_download_url,
    asset_name: ASSET_NAME,
    size_bytes: asset.size || 0,
    release_notes: String(data.body || '').slice(0, 2000)
  }
}

async function checkViaAtom(current: string): Promise<UpdateInfo> {
  const url = `https://github.com/${OWNER}/${REPO}/releases.atom`
  const res = await httpGet(url)
  if (res.status !== 200) throw new Error(githubError(res.status))
  const titleMatch = res.body.match(/<entry>[\s\S]*?<title>([^<]+)<\/title>/)
  if (!titleMatch) throw new Error('No releases found')
  const tag = titleMatch[1].trim().replace(/^v/i, '')
  const download_url = `https://github.com/${OWNER}/${REPO}/releases/download/v${tag}/${ASSET_NAME}`
  return {
    has_update: isNewerVersion(tag, current),
    current_version: current,
    latest_version: tag,
    download_url,
    asset_name: ASSET_NAME,
    size_bytes: 0,
    release_notes: ''
  }
}

export function getAppVersion(): string {
  return app.getVersion()
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = getAppVersion()
  try {
    return await checkViaApi(current)
  } catch (apiErr: any) {
    try {
      return await checkViaAtom(current)
    } catch {
      throw new Error(apiErr?.message || 'Update check failed')
    }
  }
}

function emitProgress(p: UpdateProgress): void {
  sendToRenderer('updater:progress', p)
}

export function downloadUpdate(downloadUrl: string, version: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const dest = installerPath()
    emitProgress({ stage: 'starting', received: 0, total: 0 })

    const doReq = (target: string, redirects = 0): void => {
      if (redirects > 8) {
        emitProgress({ stage: 'error', received: 0, total: 0, message: 'Too many redirects' })
        reject(new Error('Too many redirects'))
        return
      }
      const proto = target.startsWith('https') ? https : http
      proto
        .get(target, { headers: { 'User-Agent': UA } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            doReq(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            const msg = githubError(res.statusCode || 0)
            emitProgress({ stage: 'error', received: 0, total: 0, message: msg })
            reject(new Error(msg))
            return
          }
          const total = parseInt(res.headers['content-length'] || '0', 10)
          let received = 0
          const file = createWriteStream(dest)
          res.on('data', (chunk: Buffer) => {
            received += chunk.length
            emitProgress({ stage: 'downloading', received, total })
          })
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            writeFileSync(metaPath(), JSON.stringify({ version }, null, 2))
            emitProgress({ stage: 'complete', received, total, path: dest })
            resolve(dest)
          })
          file.on('error', (err) => {
            try {
              unlinkSync(dest)
            } catch {
              /* */
            }
            emitProgress({ stage: 'error', received, total, message: err.message })
            reject(err)
          })
        })
        .on('error', (err) => {
          emitProgress({ stage: 'error', received: 0, total: 0, message: err.message })
          reject(err)
        })
    }
    doReq(downloadUrl)
  })
}

export function getDownloadedInstaller(): string | null {
  const path = installerPath()
  if (!existsSync(path)) return null
  let version = ''
  try {
    if (existsSync(metaPath())) {
      version = JSON.parse(readFileSync(metaPath(), 'utf-8')).version || ''
    }
  } catch {
    version = ''
  }
  if (!version || !isNewerVersion(version, getAppVersion())) {
    try {
      unlinkSync(path)
    } catch {
      /* */
    }
    try {
      unlinkSync(metaPath())
    } catch {
      /* */
    }
    return null
  }
  return path
}

export async function installUpdate(path?: string): Promise<void> {
  const installer = path || getDownloadedInstaller()
  if (!installer || !existsSync(installer)) throw new Error('Installer not found')
  await shell.openPath(installer)
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Installing Update',
      message: 'The installer is launching.',
      detail: 'If Windows shows a security warning, click More info → Run anyway. Hire Downloader will close now.'
    })
  }
  app.quit()
}
