import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import type { FormatOption } from './types'
import { getSettings } from './settings'
import { getBinaryPath, sendToRenderer, formatBytes, formatDuration, showCompleteNotification } from './util'
import { setActive, removeActive } from './downloads'
import { onJobFinished } from './queue'
import { getWorkingCookies } from './cookies'

function buildYtDlpArgs(extras: string[]): string[] {
  return [...extras, '--no-warnings', '--extractor-args', 'youtube:player_client=ios,web']
}

function parseYtDlpOutput(text: string, id: string): string {
  let capturedDest = ''
  for (const line of text.split('\n')) {
    const progressMatch = line.match(
      /\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+)\s+ETA\s+(\S+)/
    )
    if (progressMatch) {
      sendToRenderer('ytdlp:progress', {
        id,
        progress: parseFloat(progressMatch[1]),
        speed: progressMatch[3],
        eta: progressMatch[4]
      })
    }
    const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/)
    if (destMatch) {
      capturedDest = destMatch[1].trim()
      sendToRenderer('ytdlp:destination', { id, filePath: capturedDest })
    }
    const mergeMatch = line.match(/\[Merger\]\s+Merging formats into "(.+)"/)
    if (mergeMatch) {
      capturedDest = mergeMatch[1].trim()
      sendToRenderer('ytdlp:destination', { id, filePath: capturedDest })
    }
  }
  return capturedDest
}

export function runYtDlp(
  ytdlpPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(ytdlpPath, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => resolve({ stdout, stderr, code }))
    proc.on('error', () => resolve({ stdout: '', stderr: 'spawn error', code: 1 }))
  })
}

function parseInfo(stdout: string): {
  title: string
  thumbnail: string
  duration: string
  formats: FormatOption[]
} {
  const info = JSON.parse(stdout)
  const formats: FormatOption[] = (info.formats || [])
    .filter((f: any) => f.format_id && f.height && f.ext !== 'mhtml' && f.vcodec !== 'none')
    .reduce((acc: FormatOption[], f: any) => {
      if (!acc.find((a) => a.resolution === `${f.height}p`)) {
        acc.push({
          formatId: f.format_id,
          label: `${f.height}p • ${f.ext.toUpperCase()}${f.filesize ? ' (~' + formatBytes(f.filesize) + ')' : ''}`,
          ext: f.ext || 'mp4',
          resolution: `${f.height}p`
        })
      }
      return acc
    }, [])
    .sort((a: FormatOption, b: FormatOption) => parseInt(b.resolution) - parseInt(a.resolution))

  return {
    title: info.title || 'Unknown',
    thumbnail: info.thumbnail || '',
    duration: info.duration ? formatDuration(info.duration) : '',
    formats
  }
}

export async function fetchYtDlpInfo(url: string): Promise<any> {
  const ytdlpPath = getBinaryPath('yt-dlp.exe')
  const baseArgs = ['--dump-single-json', '--no-playlist', url]

  const first = await runYtDlp(ytdlpPath, buildYtDlpArgs(baseArgs))
  if (first.code === 0 && first.stdout) return parseInfo(first.stdout)
  if (!/Sign in to confirm|bot|captcha|format is not available/i.test(first.stderr)) {
    throw new Error(first.stderr || 'yt-dlp failed')
  }

  const cookies = await getWorkingCookies(ytdlpPath)
  if (cookies) {
    const r = await runYtDlp(ytdlpPath, buildYtDlpArgs(['--cookies-from-browser', cookies, ...baseArgs]))
    if (r.code === 0 && r.stdout) return parseInfo(r.stdout)
  }

  const tv = await runYtDlp(ytdlpPath, [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--extractor-args',
    'youtube:player_client=tv_embedded',
    url
  ])
  if (tv.code === 0 && tv.stdout) return parseInfo(tv.stdout)

  throw new Error('YouTube bot detection — open a browser, visit youtube.com, then try again')
}

export async function fetchPlaylistInfo(url: string): Promise<any[]> {
  const ytdlpPath = getBinaryPath('yt-dlp.exe')
  const tryFetch = async (extra: string[]): Promise<any[]> => {
    const { stdout, code } = await runYtDlp(
      ytdlpPath,
      buildYtDlpArgs(['--flat-playlist', '--dump-single-json', ...extra, url])
    )
    if (code !== 0 || !stdout) return []
    const info = JSON.parse(stdout)
    return (info.entries || []).map((e: any) => ({
      url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title || 'Unknown',
      thumbnail: e.thumbnail || '',
      duration: e.duration ? formatDuration(e.duration) : ''
    }))
  }

  let entries = await tryFetch([])
  if (entries.length) return entries
  const cookies = await getWorkingCookies(ytdlpPath)
  if (cookies) {
    entries = await tryFetch(['--cookies-from-browser', cookies])
    if (entries.length) return entries
  }
  throw new Error('Failed to fetch playlist')
}

function attachProc(id: string, proc: ChildProcess, onClose: (code: number | null, stderr: string, dest: string) => void): void {
  let stderr = ''
  let dest = ''
  setActive(id, {
    kind: 'proc',
    kill: () => {
      try {
        proc.kill()
      } catch {
        /* */
      }
    }
  })

  proc.stdout?.on('data', (data: Buffer) => {
    const d = parseYtDlpOutput(data.toString(), id)
    if (d) dest = d
  })
  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString()
    stderr += text
    const d = parseYtDlpOutput(text, id)
    if (d) dest = d
    sendToRenderer('ytdlp:log', { id, message: text })
  })
  proc.on('close', (code) => {
    removeActive(id)
    onClose(code, stderr, dest)
    onJobFinished(id)
  })
  proc.on('error', (err) => {
    removeActive(id)
    sendToRenderer('ytdlp:error', { id, error: err.message })
    onJobFinished(id)
  })
}

export function startYtDlpDownload(
  id: string,
  url: string,
  formatId: string,
  retryOnFormatError = true,
  resume = false
): void {
  const ytdlpPath = getBinaryPath('yt-dlp.exe')
  const settings = getSettings()
  const outputPath = join(settings.downloadPath, '%(title)s.%(ext)s')
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--progress',
    '--newline',
    '--extractor-args',
    'youtube:player_client=ios,web',
    '--ffmpeg-location',
    getBinaryPath('ffmpeg.exe'),
    '--merge-output-format',
    'mp4',
    '-o',
    outputPath,
    '--paths',
    settings.downloadPath
  ]
  if (resume) args.push('-c')
  args.push('-f', formatId || 'best', url)

  const proc = spawn(ytdlpPath, args)
  attachProc(id, proc, (code, stderr, dest) => {
    if (code === 0) {
      sendToRenderer('ytdlp:complete', { id, progress: 100 })
      showCompleteNotification(dest)
      return
    }
    if (/Sign in to confirm|bot|captcha/i.test(stderr)) {
      sendToRenderer('ytdlp:log', { id, message: 'Bot detection — retrying with cookies' })
      retryWithCookies(id, url, formatId, resume)
      return
    }
    if (retryOnFormatError && /format is not available|Requested format/i.test(stderr)) {
      startYtDlpDownload(id, url, 'best', false, resume)
      return
    }
    sendToRenderer('ytdlp:error', { id, error: stderr || `yt-dlp exited with code ${code}` })
  })
}

async function retryWithCookies(id: string, url: string, formatId: string, resume: boolean): Promise<void> {
  const ytdlpPath = getBinaryPath('yt-dlp.exe')
  const browser = await getWorkingCookies(ytdlpPath)
  if (!browser) {
    sendToRenderer('ytdlp:error', { id, error: 'Bot detection — no working cookies found' })
    onJobFinished(id)
    return
  }
  const settings = getSettings()
  const outputPath = join(settings.downloadPath, '%(title)s.%(ext)s')
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--progress',
    '--newline',
    '--extractor-args',
    'youtube:player_client=ios,web',
    '--cookies-from-browser',
    browser,
    '--ffmpeg-location',
    getBinaryPath('ffmpeg.exe'),
    '--merge-output-format',
    'mp4',
    '-o',
    outputPath,
    '--paths',
    settings.downloadPath
  ]
  if (resume) args.push('-c')
  args.push('-f', formatId || 'best', url)
  sendToRenderer('ytdlp:log', { id, message: `Retrying with ${browser} cookies...` })
  const proc = spawn(ytdlpPath, args)
  attachProc(id, proc, (code, _stderr, dest) => {
    if (code === 0) {
      sendToRenderer('ytdlp:complete', { id, progress: 100 })
      showCompleteNotification(dest)
    } else {
      sendToRenderer('ytdlp:error', { id, error: `Cookie retry failed with code ${code}` })
    }
  })
}
