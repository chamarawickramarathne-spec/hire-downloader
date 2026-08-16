import { useState, useEffect } from 'react'
import type { Settings } from '../types'

interface SettingsPanelProps {
  settings: Settings
  onUpdate: (settings: Partial<Settings>) => Promise<void>
  onUpdateSchedule: (schedule: { scheduleEnabled: boolean; scheduleStartTime: string; scheduleEndTime: string }) => Promise<void>
  onClose: () => void
}

export default function SettingsPanel({ settings, onUpdate, onUpdateSchedule, onClose }: SettingsPanelProps) {
  const [maxConcurrent, setMaxConcurrent] = useState(settings.maxConcurrent)
  const [downloadPath, setDownloadPath] = useState(settings.downloadPath)
  const [scheduleEnabled, setScheduleEnabled] = useState(settings.scheduleEnabled)
  const [scheduleStartTime, setScheduleStartTime] = useState(settings.scheduleStartTime)
  const [scheduleEndTime, setScheduleEndTime] = useState(settings.scheduleEndTime)

  useEffect(() => {
    setMaxConcurrent(settings.maxConcurrent)
    setDownloadPath(settings.downloadPath)
    setScheduleEnabled(settings.scheduleEnabled)
    setScheduleStartTime(settings.scheduleStartTime)
    setScheduleEndTime(settings.scheduleEndTime)
  }, [settings])

  const handleBrowse = async () => {
    await onUpdate({ downloadPath: '' })
  }

  const handleMaxChange = async (value: number) => {
    setMaxConcurrent(value)
    await onUpdate({ maxConcurrent: value })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 flex max-h-[85vh] w-full max-w-md flex-col rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Download path */}
          <div className="mb-5">
            <label className="mb-1.5 block text-sm font-medium text-gray-300">Download Directory</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={downloadPath}
              readOnly
              className="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-300 outline-none"
            />
            <button
              onClick={handleBrowse}
              className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-600"
            >
              Browse
            </button>
          </div>
        </div>

        {/* Max concurrent */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-300">
            Max Concurrent Downloads: {maxConcurrent}
          </label>
          <input
            type="range"
            min={1}
            max={10}
            value={maxConcurrent}
            onChange={(e) => handleMaxChange(parseInt(e.target.value))}
            className="w-full accent-red-500"
          />
          <div className="mt-1 flex justify-between text-[11px] text-gray-500">
            <span>1</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>

        {/* Schedule */}
        <div className="mt-5 border-t border-gray-700 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Scheduled Downloads</label>
            <button
              onClick={async () => {
                const next = !scheduleEnabled
                setScheduleEnabled(next)
                await onUpdateSchedule({ scheduleEnabled: next, scheduleStartTime, scheduleEndTime })
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                scheduleEnabled ? 'bg-red-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  scheduleEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {scheduleEnabled && (
            <>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-gray-400">Start Time</label>
                  <input
                    type="time"
                    value={scheduleStartTime}
                    onChange={async (e) => {
                      const val = e.target.value
                      setScheduleStartTime(val)
                      await onUpdateSchedule({ scheduleEnabled, scheduleStartTime: val, scheduleEndTime })
                    }}
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-300 outline-none focus:border-red-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-gray-400">Stop Time</label>
                  <input
                    type="time"
                    value={scheduleEndTime}
                    onChange={async (e) => {
                      const val = e.target.value
                      setScheduleEndTime(val)
                      await onUpdateSchedule({ scheduleEnabled, scheduleStartTime, scheduleEndTime: val })
                    }}
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-300 outline-none focus:border-red-500"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Downloads start at {scheduleStartTime} and stop at {scheduleEndTime} daily.
              </p>
            </>
          )}
        </div>

          <AboutUpdates />
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function AboutUpdates() {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setVersion)
  }, [])

  const check = async () => {
    setBusy(true)
    setStatus('Checking…')
    try {
      const info = await window.api.checkForUpdate()
      setNotes(info.release_notes || '')
      if (info.has_update) {
        setStatus(`Update available: v${info.latest_version}`)
        setBusy(false)
        return info
      }
      setStatus(`Up to date · v${info.current_version}`)
    } catch (err: any) {
      setStatus(err?.message || 'Check failed')
    }
    setBusy(false)
    return null
  }

  const downloadAndInstall = async () => {
    setBusy(true)
    try {
      const info = await window.api.checkForUpdate()
      if (!info.has_update) {
        setStatus(`Up to date · v${info.current_version}`)
        setBusy(false)
        return
      }
      setStatus(`Downloading v${info.latest_version}…`)
      const unsub = window.api.onUpdateProgress((p) => {
        if (p.stage === 'downloading' && p.total > 0) {
          setStatus(`Downloading… ${Math.round((p.received / p.total) * 100)}%`)
        }
        if (p.stage === 'complete' && p.path) {
          setStatus('Launching installer…')
          window.api.installUpdate(p.path)
        }
        if (p.stage === 'error') setStatus(p.message || 'Download failed')
      })
      await window.api.downloadUpdate({ url: info.download_url, version: info.latest_version })
      unsub()
    } catch (err: any) {
      setStatus(err?.message || 'Update failed')
    }
    setBusy(false)
  }

  return (
    <div className="mt-5 border-t border-gray-700 pt-5">
      <label className="mb-1.5 block text-sm font-medium text-gray-300">About & Updates</label>
      <p className="mb-2 text-xs text-gray-400">Hire Downloader v{version || '…'}</p>
      <p className="mb-3 text-xs text-gray-500">
        Updates from GitHub: chamarawickramarathne-spec/hire-downloader
      </p>
      {status && <p className="mb-2 text-xs text-gray-300">{status}</p>}
      {notes && (
        <pre className="mb-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-gray-900 p-2 text-[11px] text-gray-400">
          {notes}
        </pre>
      )}
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => void check()}
          className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-600 disabled:opacity-50"
        >
          Check for updates
        </button>
        <button
          disabled={busy}
          onClick={() => void downloadAndInstall()}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
        >
          Download & install
        </button>
      </div>
    </div>
  )
}
