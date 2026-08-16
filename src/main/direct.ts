import * as https from 'https'
import * as http from 'http'
import { createWriteStream, existsSync, statSync } from 'fs'
import { join } from 'path'
import { getSettings } from './settings'
import { formatBytes, sendToRenderer, showCompleteNotification } from './util'
import { setActive, removeActive } from './downloads'
import { onJobFinished } from './queue'

function guessFileName(url: string, disposition: string): string {
  const match = disposition.match(/filename[*]?=(?:UTF-8''|"?)([^";\n]+)/i)
  if (match) return decodeURIComponent(match[1].replace(/"/g, ''))
  try {
    const urlPath = new URL(url).pathname
    return decodeURIComponent(urlPath.split('/').pop() || 'download')
  } catch {
    return 'download'
  }
}

export async function fetchDirectInfo(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const req = protocol.request(url, { method: 'HEAD' }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchDirectInfo(res.headers.location).then(resolve).catch(reject)
        return
      }
      const contentLength = parseInt(res.headers['content-length'] || '0', 10)
      const contentType = res.headers['content-type'] || ''
      const fileName = guessFileName(url, res.headers['content-disposition'] || '')
      resolve({
        title: fileName,
        thumbnail: '',
        duration: '',
        totalSize: contentLength,
        contentType,
        fileName
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })
    req.end()
  })
}

export function startDirectDownload(id: string, url: string, resume = false): void {
  const protocol = url.startsWith('https') ? https : http
  const settings = getSettings()
  let aborted = false
  let currentReq: http.ClientRequest | null = null
  let fileStream: ReturnType<typeof createWriteStream> | null = null

  const destroy = (): void => {
    aborted = true
    try {
      currentReq?.destroy()
    } catch {
      /* */
    }
    try {
      fileStream?.destroy()
    } catch {
      /* */
    }
  }

  setActive(id, { kind: 'http', destroy, kill: destroy })

  const follow = (targetUrl: string, redirects = 0): void => {
    if (aborted) return
    if (redirects > 10) {
      removeActive(id)
      sendToRenderer('ytdlp:error', { id, error: 'Too many redirects' })
      onJobFinished(id)
      return
    }

    const headers: Record<string, string> = {}
    let startAt = 0
    let fileName = guessFileName(targetUrl, '')
    let filePath = join(settings.downloadPath, fileName)

    if (resume && existsSync(filePath)) {
      startAt = statSync(filePath).size
      if (startAt > 0) headers['Range'] = `bytes=${startAt}-`
    }

    currentReq = protocol.request(targetUrl, { headers }, (res) => {
      if (aborted) return
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let next = res.headers.location
        if (next.startsWith('/')) {
          const base = new URL(targetUrl)
          next = `${base.protocol}//${base.host}${next}`
        }
        follow(next, redirects + 1)
        return
      }

      if (res.statusCode !== 200 && res.statusCode !== 206) {
        removeActive(id)
        sendToRenderer('ytdlp:error', { id, error: `HTTP ${res.statusCode}` })
        onJobFinished(id)
        return
      }

      fileName = guessFileName(targetUrl, res.headers['content-disposition'] || '')
      filePath = join(settings.downloadPath, fileName)
      if (resume && existsSync(filePath) && res.statusCode === 206) {
        startAt = statSync(filePath).size
      } else {
        startAt = 0
      }

      const totalHeader = parseInt(res.headers['content-length'] || '0', 10)
      const total = res.statusCode === 206 ? startAt + totalHeader : totalHeader
      let downloaded = startAt
      let lastBytes = downloaded
      let lastTime = Date.now()

      fileStream = createWriteStream(filePath, { flags: startAt > 0 && res.statusCode === 206 ? 'a' : 'w' })
      sendToRenderer('ytdlp:destination', { id, filePath })

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const now = Date.now()
        const dt = (now - lastTime) / 1000
        let speed = ''
        let eta = ''
        if (dt >= 0.5) {
          const rate = (downloaded - lastBytes) / dt
          speed = formatBytes(rate) + '/s'
          if (total > 0 && rate > 0) {
            const secs = (total - downloaded) / rate
            const m = Math.floor(secs / 60)
            const s = Math.floor(secs % 60)
            eta = m > 0 ? `${m}m ${s}s` : `${s}s`
          }
          lastBytes = downloaded
          lastTime = now
        }
        const progress = total > 0 ? (downloaded / total) * 100 : 0
        sendToRenderer('ytdlp:progress', {
          id,
          progress: Math.round(progress * 10) / 10,
          speed,
          eta
        })
      })

      res.pipe(fileStream)

      fileStream.on('finish', () => {
        if (aborted) return
        removeActive(id)
        sendToRenderer('ytdlp:complete', { id, progress: 100 })
        showCompleteNotification(filePath)
        onJobFinished(id)
      })

      fileStream.on('error', (err: Error) => {
        if (aborted) return
        removeActive(id)
        sendToRenderer('ytdlp:error', { id, error: err.message })
        onJobFinished(id)
      })
    })

    currentReq.on('error', (err) => {
      if (aborted) return
      removeActive(id)
      sendToRenderer('ytdlp:error', { id, error: err.message })
      onJobFinished(id)
    })
    currentReq.end()
  }

  follow(url)
}
