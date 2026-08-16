import { useEffect, useState, useCallback, useRef } from 'react'

type Feedback = { type: 'ok' | 'err'; message: string } | null

export default function UpdateBadge() {
  const [version, setVersion] = useState('')
  const [latest, setLatest] = useState('')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [percent, setPercent] = useState(0)
  const [readyPath, setReadyPath] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const showFeedback = (type: 'ok' | 'err', message: string): void => {
    setFeedback({ type, message })
    setTimeout(() => setFeedback(null), 3500)
  }

  const loadVersion = useCallback(async () => {
    const v = await window.api.getAppVersion()
    setVersion(v)
  }, [])

  const detectDownloaded = useCallback(async () => {
    const path = await window.api.getDownloadedInstaller()
    if (path) setReadyPath(path)
  }, [])

  const check = useCallback(async (silent = false) => {
    setChecking(true)
    try {
      const info = await window.api.checkForUpdate()
      setLatest(info.latest_version)
      setHasUpdate(info.has_update)
      setDownloadUrl(info.download_url || '')
      if (!silent) {
        if (info.has_update) showFeedback('ok', `Update available · v${info.latest_version}`)
        else showFeedback('ok', `Up to date · v${info.current_version}`)
      }
      return info
    } catch (err: any) {
      if (!silent) showFeedback('err', err?.message || 'Update check failed')
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  const startDownload = useCallback(async (url: string, ver: string) => {
    setDownloading(true)
    setPercent(0)
    unsubRef.current?.()
    unsubRef.current = window.api.onUpdateProgress((p) => {
      if (p.stage === 'downloading' && p.total > 0) {
        setPercent(Math.round((p.received / p.total) * 100))
      }
      if (p.stage === 'complete' && p.path) {
        setReadyPath(p.path)
        setDownloading(false)
        showFeedback('ok', 'Downloaded — launching installer…')
        setTimeout(() => {
          window.api.installUpdate(p.path).catch((e: any) => {
            showFeedback('err', e?.message || 'Install failed')
          })
        }, 2000)
      }
      if (p.stage === 'error') {
        setDownloading(false)
        showFeedback('err', p.message || 'Download failed')
      }
    })
    try {
      await window.api.downloadUpdate({ url, version: ver })
    } catch (err: any) {
      setDownloading(false)
      showFeedback('err', err?.message || 'Download failed')
    }
  }, [])

  const oneClick = useCallback(async () => {
    if (readyPath) {
      try {
        await window.api.installUpdate(readyPath)
      } catch (err: any) {
        showFeedback('err', err?.message || 'Install failed')
      }
      return
    }
    if (downloading || checking) return
    if (hasUpdate && downloadUrl && latest) {
      await startDownload(downloadUrl, latest)
      return
    }
    const info = await check(false)
    if (info?.has_update && info.download_url) {
      await startDownload(info.download_url, info.latest_version)
    }
  }, [readyPath, downloading, checking, hasUpdate, downloadUrl, latest, check, startDownload])

  useEffect(() => {
    loadVersion()
    detectDownloaded()
    check(true)
    return () => unsubRef.current?.()
  }, [loadVersion, detectDownloaded, check])

  let label = 'Update'
  if (checking) label = 'Checking…'
  else if (downloading) label = `${percent}%`
  else if (readyPath) label = 'Install & Restart'
  else if (hasUpdate && latest) label = `Download v${latest}`

  return (
    <div className="relative flex items-center gap-2">
      {version && (
        <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
          v{version}
        </span>
      )}
      <button
        onClick={oneClick}
        disabled={checking || downloading}
        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
          hasUpdate || readyPath
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
        } disabled:opacity-50`}
      >
        {label}
      </button>
      {feedback && (
        <div
          className={`absolute right-0 top-full z-50 mt-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs shadow-lg ${
            feedback.type === 'ok' ? 'bg-gray-700 text-gray-100' : 'bg-red-900 text-red-100'
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  )
}
