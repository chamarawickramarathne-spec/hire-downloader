import { useState, useCallback, useRef } from 'react'

interface BatchImportModalProps {
  onAdd: (url: string) => void
  onClose: () => void
}

export default function BatchImportModal({
  onAdd,
  onClose
}: BatchImportModalProps) {
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const abortRef = useRef(false)

  const handleImport = useCallback(async () => {
    const urls = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (urls.length === 0) return

    setImporting(true)
    setProgress({ done: 0, total: urls.length })
    abortRef.current = false

    for (let i = 0; i < urls.length; i++) {
      if (abortRef.current) break
      onAdd(urls[i])
      setProgress({ done: i + 1, total: urls.length })
      // Small delay between adds to avoid overwhelming the backend
      await new Promise((r) => setTimeout(r, 300))
    }

    setImporting(false)
    onClose()
  }, [text, onAdd, onClose])

  const handleAbort = useCallback(() => {
    abortRef.current = true
    setImporting(false)
    onClose()
  }, [onClose])

  const urlCount = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Batch Import URLs</h2>
          <button
            onClick={handleAbort}
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

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste URLs here, one per line...&#10;https://youtube.com/watch?v=...&#10;magnet:?xt=...&#10;https://example.com/file.zip"
          className="h-48 w-full resize-none rounded-lg border border-gray-600 bg-gray-900 p-3 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-red-500"
          disabled={importing}
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {urlCount} URL{urlCount !== 1 ? 's' : ''} detected
          </span>
          {importing && (
            <span className="text-xs text-gray-400">
              Importing {progress.done}/{progress.total}...
            </span>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={handleAbort}
            className="rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={urlCount === 0 || importing}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {importing ? 'Importing...' : 'Import All'}
          </button>
        </div>
      </div>
    </div>
  )
}
