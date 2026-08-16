const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const os = require('os')

const RESOURCES_DIR = path.join(__dirname, '..', 'resources')

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      console.log(`  ${path.basename(dest)} already exists, skipping`)
      resolve()
      return
    }

    console.log(`  Downloading ${path.basename(dest)}...`)
    const file = fs.createWriteStream(dest)

    function followRedirects(targetUrl, redirects = 0) {
      if (redirects > 10) {
        file.destroy()
        reject(new Error('Too many redirects'))
        return
      }
      const proto = targetUrl.startsWith('https') ? https : http
      proto
        .get(targetUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            followRedirects(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            file.destroy()
            fs.unlink(dest, () => {})
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          res.pipe(file)
          file.on('finish', () => {
            file.close()
            resolve()
          })
        })
        .on('error', (err) => {
          fs.unlink(dest, () => {})
          reject(err)
        })
    }

    followRedirects(url)
  })
}

async function ensureFfmpeg() {
  const dest = path.join(RESOURCES_DIR, 'ffmpeg.exe')
  if (fs.existsSync(dest)) {
    console.log('  ffmpeg.exe already exists, skipping')
    return
  }

  // Official yt-dlp ffmpeg builds (BtbN style mirror used widely with yt-dlp)
  const zipUrl =
    'https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
  const tmpZip = path.join(os.tmpdir(), 'ffmpeg-hire-dl.zip')
  const tmpDir = path.join(os.tmpdir(), 'ffmpeg-hire-dl-extract')

  try {
    await download(zipUrl, tmpZip)
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.mkdirSync(tmpDir, { recursive: true })

    // Expand-Archive via PowerShell (available on Windows)
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${tmpZip}' -DestinationPath '${tmpDir}' -Force`
      ],
      { stdio: 'inherit' }
    )

    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        const st = fs.statSync(full)
        if (st.isDirectory()) {
          const found = walk(full)
          if (found) return found
        } else if (name.toLowerCase() === 'ffmpeg.exe') {
          return full
        }
      }
      return null
    }

    const found = walk(tmpDir)
    if (!found) throw new Error('ffmpeg.exe not found in archive')
    fs.copyFileSync(found, dest)
    console.log('  ffmpeg.exe extracted')
  } catch (err) {
    console.warn(`  Warning: Failed to fetch ffmpeg: ${err.message}`)
    console.warn('  Place ffmpeg.exe manually in resources/')
  } finally {
    try {
      fs.unlinkSync(tmpZip)
    } catch {
      /* */
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* */
    }
  }
}

async function main() {
  if (!fs.existsSync(RESOURCES_DIR)) fs.mkdirSync(RESOURCES_DIR, { recursive: true })
  console.log('Downloading binaries...')
  try {
    await download(
      'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
      path.join(RESOURCES_DIR, 'yt-dlp.exe')
    )
  } catch (err) {
    console.warn(`  Warning: Failed to download yt-dlp.exe: ${err.message}`)
  }
  await ensureFfmpeg()
  console.log('Binary download complete.')
}

main().catch(console.error)
