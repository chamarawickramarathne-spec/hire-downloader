import { useState, useEffect, useCallback, useRef } from 'react'
import type { DownloadItem, HistoryItem, Settings, DownloadType } from './types'
import Header from './components/Header'
import URLInput from './components/URLInput'
import DownloadRow from './components/DownloadRow'
import BatchImportModal from './components/BatchImportModal'
import SettingsPanel from './components/SettingsPanel'
import HistorySection from './components/HistorySection'
import { detectType, emptyItem, isPlaylistUrl, startEngine } from './downloadHelpers'

export default function App() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [settings, setSettings] = useState<Settings>({
    downloadPath: '',
    maxConcurrent: 1,
    scheduleEnabled: false,
    scheduleStartTime: '01:00',
    scheduleEndTime: '06:00'
  })
  const [showSettings, setShowSettings] = useState(false)
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [queueInfo, setQueueInfo] = useState({ active: 0, queued: 0 })
  const cleanupRefs = useRef<(() => void)[]>([])

  useEffect(() => {
    void (async () => {
      const [path, max, hist, sched] = await Promise.all([
        window.api.getDownloadPath(),
        window.api.getMaxConcurrent(),
        window.api.loadHistory(),
        window.api.getSchedule()
      ])
      setSettings({
        downloadPath: path,
        maxConcurrent: max,
        scheduleEnabled: sched.scheduleEnabled,
        scheduleStartTime: sched.scheduleStartTime,
        scheduleEndTime: sched.scheduleEndTime
      })
      setHistory(hist)
    })()
  }, [])

  useEffect(() => {
    const unsubs = [
      window.api.onProgress(({ id, progress, speed, eta }) => {
        setDownloads((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, progress, speed, eta, status: 'downloading' as const } : d
          )
        )
      }),
      window.api.onComplete(({ id }) => {
        setDownloads((prev) => {
          const item = prev.find((d) => d.id === id)
          if (!item) return prev
          const histItem: HistoryItem = {
            id: item.id,
            url: item.url,
            type: item.type,
            title: item.title,
            thumbnail: item.thumbnail,
            filePath: item.filePath,
            fileName: item.fileName,
            completedAt: new Date().toISOString(),
            badge: item.badge
          }
          setHistory((h) => {
            const next = [histItem, ...h]
            window.api.saveHistory(next)
            return next
          })
          return prev.map((d) =>
            d.id === id ? { ...d, status: 'completed' as const, progress: 100 } : d
          )
        })
      }),
      window.api.onError(({ id, error }) => {
        setDownloads((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status: 'error' as const, error } : d))
        )
      }),
      window.api.onDestination(({ id, filePath }) => {
        setDownloads((prev) => prev.map((d) => (d.id === id ? { ...d, filePath } : d)))
      }),
      window.api.onQueueUpdate(({ active, queued }) => setQueueInfo({ active, queued })),
      window.api.onScheduleAction(({ action }) => {
        if (action === 'start') {
          setDownloads((prev) => {
            prev.filter((d) => d.status === 'ready').forEach((d) => startEngine(d))
            return prev.map((d) =>
              d.status === 'ready' ? { ...d, status: 'queued' as const } : d
            )
          })
        } else if (action === 'stop') {
          setDownloads((prev) =>
            prev.map((d) =>
              d.status === 'downloading' || d.status === 'queued'
                ? { ...d, status: 'error' as const, error: 'Stopped by schedule' }
                : d
            )
          )
        }
      })
    ]
    cleanupRefs.current = unsubs
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const fetchSingle = useCallback(async (id: string, url: string, type: DownloadType) => {
    try {
      let info: any
      if (type === 'youtube') info = await window.api.fetchInfo(url)
      else if (type === 'torrent') info = await window.api.fetchMagnetInfo(url)
      else info = await window.api.fetchDirectInfo(url)
      setDownloads((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                status: 'ready' as const,
                title: info.title || url,
                thumbnail: info.thumbnail || '',
                duration: info.duration || '',
                formats: info.formats || [],
                selectedFormat: info.formats?.[0]?.formatId || '',
                totalSize: info.totalSize || 0
              }
            : d
        )
      )
    } catch (err: any) {
      setDownloads((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: 'error' as const, error: err.message || 'Failed to fetch info' }
            : d
        )
      )
    }
  }, [])

  const handleAddUrl = useCallback(
    async (url: string) => {
      const type = detectType(url)
      if (type === 'youtube' && isPlaylistUrl(url)) {
        const placeholder = emptyItem(url, 'youtube')
        placeholder.title = 'Loading playlist…'
        setDownloads((prev) => [placeholder, ...prev])
        try {
          const entries = await window.api.fetchPlaylist(url)
          setDownloads((prev) => prev.filter((d) => d.id !== placeholder.id))
          if (!entries.length) throw new Error('Empty playlist')
          const items = entries.map((e) => {
            const item = emptyItem(e.url, 'youtube')
            item.title = e.title || e.url
            item.thumbnail = e.thumbnail || ''
            item.duration = e.duration || ''
            return item
          })
          setDownloads((prev) => [...items, ...prev])
          for (const item of items) void fetchSingle(item.id, item.url, 'youtube')
        } catch (err: any) {
          setDownloads((prev) =>
            prev.map((d) =>
              d.id === placeholder.id
                ? { ...d, status: 'error' as const, error: err.message || 'Playlist failed' }
                : d
            )
          )
        }
        return
      }
      const newItem = emptyItem(url, type)
      setDownloads((prev) => [newItem, ...prev])
      await fetchSingle(newItem.id, url, type)
    },
    [fetchSingle]
  )

  const handleStartDownload = useCallback((item: DownloadItem) => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === item.id ? { ...d, status: 'queued' as const } : d))
    )
    startEngine(item)
  }, [])

  const handleCancel = useCallback((id: string) => {
    window.api.cancelDownload({ id })
    setDownloads((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'error' as const, error: 'Cancelled' } : d))
    )
  }, [])

  const handlePause = useCallback((item: DownloadItem) => {
    window.api.pauseDownload({ id: item.id })
    setDownloads((prev) =>
      prev.map((d) => (d.id === item.id ? { ...d, status: 'paused' as const, speed: '' } : d))
    )
  }, [])

  const handleResume = useCallback((item: DownloadItem) => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === item.id ? { ...d, status: 'queued' as const } : d))
    )
    window.api.resumeDownload({
      id: item.id,
      url: item.url,
      type: item.type,
      formatId: item.selectedFormat
    })
  }, [])

  const handleRetry = useCallback((item: DownloadItem) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === item.id
          ? { ...d, status: 'ready' as const, progress: 0, error: '', speed: '', eta: '' }
          : d
      )
    )
  }, [])

  const handleUpdateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    if (newSettings.downloadPath !== undefined) {
      await window.api.setDownloadPath()
      const path = await window.api.getDownloadPath()
      setSettings((prev) => ({ ...prev, downloadPath: path }))
    }
    if (newSettings.maxConcurrent !== undefined) {
      await window.api.setMaxConcurrent(newSettings.maxConcurrent)
      const max = await window.api.getMaxConcurrent()
      setSettings((prev) => ({ ...prev, maxConcurrent: max }))
    }
  }, [])

  const handleUpdateSchedule = useCallback(
    async (data: {
      scheduleEnabled: boolean
      scheduleStartTime: string
      scheduleEndTime: string
    }) => {
      await window.api.setSchedule(data)
      const sched = await window.api.getSchedule()
      setSettings((prev) => ({ ...prev, ...sched }))
    },
    []
  )

  const handleRemove = useCallback((id: string) => {
    setDownloads((prev) => {
      const item = prev.find((d) => d.id === id)
      if (item && ['downloading', 'queued', 'paused'].includes(item.status)) {
        window.api.cancelDownload({ id })
      }
      return prev.filter((d) => d.id !== id)
    })
  }, [])

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-gray-100">
      <Header
        queueInfo={queueInfo}
        onSettingsClick={() => setShowSettings(true)}
        onDownloadAll={() =>
          downloads.filter((d) => d.status === 'ready').forEach((d) => handleStartDownload(d))
        }
        onImportClick={() => setShowBatchModal(true)}
        hasReadyDownloads={downloads.some((d) => d.status === 'ready')}
      />
      <main className="flex-1 overflow-y-auto p-4">
        <URLInput onAdd={handleAddUrl} />
        <div className="mt-4 space-y-2">
          {downloads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <p className="text-lg">Paste a URL above to start downloading</p>
              <p className="mt-1 text-sm">YouTube, playlists, torrents, and direct files</p>
            </div>
          )}
          {downloads.map((item) => (
            <DownloadRow
              key={item.id}
              item={item}
              onStart={handleStartDownload}
              onCancel={handleCancel}
              onPause={handlePause}
              onResume={handleResume}
              onRetry={handleRetry}
              onFormatChange={(id, formatId) =>
                setDownloads((prev) =>
                  prev.map((d) => (d.id === id ? { ...d, selectedFormat: formatId } : d))
                )
              }
              onShowInFolder={(p) => window.api.showInFolder(p)}
              onRemove={handleRemove}
            />
          ))}
        </div>
        <HistorySection
          history={history}
          onRetry={(item) => handleAddUrl(item.url)}
          onClear={() => {
            setHistory([])
            window.api.clearHistory()
          }}
          onDelete={(id) => {
            const next = history.filter((h) => h.id !== id)
            setHistory(next)
            window.api.saveHistory(next)
          }}
        />
      </main>
      {showBatchModal && (
        <BatchImportModal onAdd={handleAddUrl} onClose={() => setShowBatchModal(false)} />
      )}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdate={handleUpdateSettings}
          onUpdateSchedule={handleUpdateSchedule}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
