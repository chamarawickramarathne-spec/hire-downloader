import type { DownloadItem } from '../types'

interface DownloadRowProps {
  item: DownloadItem
  onStart: (item: DownloadItem) => void
  onCancel: (id: string) => void
  onPause: (item: DownloadItem) => void
  onResume: (item: DownloadItem) => void
  onRetry: (item: DownloadItem) => void
  onFormatChange: (id: string, formatId: string) => void
  onShowInFolder: (filePath: string) => void
  onRemove: (id: string) => void
}

const badgeColors: Record<string, string> = {
  YT: 'bg-red-600 text-white',
  TOR: 'bg-purple-600 text-white',
  DL: 'bg-blue-600 text-white'
}

const statusBorder: Record<string, string> = {
  fetching: 'border-gray-600',
  ready: 'border-yellow-600',
  downloading: 'border-blue-600',
  queued: 'border-indigo-600',
  completed: 'border-green-600',
  error: 'border-red-600',
  paused: 'border-gray-500 border-dashed'
}

export default function DownloadRow({
  item,
  onStart,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onFormatChange,
  onShowInFolder,
  onRemove
}: DownloadRowProps) {
  return (
    <div
      className={`rounded-lg border bg-gray-800 p-3 transition-colors ${statusBorder[item.status] || 'border-gray-700'}`}
    >
      <div className="flex items-start gap-3">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            className="h-16 w-28 flex-shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-16 w-28 flex-shrink-0 items-center justify-center rounded bg-gray-700">
            <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badgeColors[item.badge]}`}>
              {item.badge}
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-8 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold ${badgeColors[item.badge]}`}
            >
              {item.badge}
            </span>
            <h3 className="truncate text-sm font-medium text-gray-100">{item.title}</h3>
          </div>

          <p className="mt-0.5 truncate text-xs text-gray-500">{item.url}</p>

          {item.duration && (
            <span className="mt-1 inline-block rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
              {item.duration}
            </span>
          )}

          {item.status === 'fetching' && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-500 border-t-red-500" />
              Fetching info...
            </div>
          )}

          {item.status === 'queued' && (
            <p className="mt-1 text-xs text-indigo-300">Queued — waiting for a free slot</p>
          )}

          {(item.status === 'downloading' || item.status === 'paused') && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${item.status === 'paused' ? 'bg-gray-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(item.progress, 100)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                <span>
                  {item.status === 'paused' ? 'Paused · ' : ''}
                  {item.progress.toFixed(1)}%
                </span>
                {item.speed && item.status === 'downloading' && <span>{item.speed}</span>}
                {item.eta && item.eta !== '∞' && item.status === 'downloading' && (
                  <span>ETA {item.eta}</span>
                )}
              </div>
            </div>
          )}

          {item.status === 'error' && <p className="mt-1 text-xs text-red-400">{item.error}</p>}

          {item.status === 'completed' && (
            <p className="mt-1 text-xs text-green-400">
              Download complete
              {item.filePath && ` — ${item.filePath.split(/[/\\]/).pop()}`}
            </p>
          )}

          {item.type === 'youtube' && item.formats.length > 0 && item.status === 'ready' && (
            <select
              value={item.selectedFormat}
              onChange={(e) => onFormatChange(item.id, e.target.value)}
              className="mt-2 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-200 outline-none"
            >
              {item.formats.map((f) => (
                <option key={f.formatId} value={f.formatId}>
                  {f.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col gap-1">
          {item.status === 'ready' && (
            <button
              onClick={() => onStart(item)}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Start
            </button>
          )}
          {item.status === 'downloading' && (
            <>
              <button
                onClick={() => onPause(item)}
                className="rounded bg-gray-600 px-3 py-1 text-xs font-medium text-gray-200 hover:bg-gray-500"
              >
                Pause
              </button>
              <button
                onClick={() => onCancel(item.id)}
                className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
              >
                Cancel
              </button>
            </>
          )}
          {item.status === 'paused' && (
            <>
              <button
                onClick={() => onResume(item)}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Resume
              </button>
              <button
                onClick={() => onCancel(item.id)}
                className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
              >
                Cancel
              </button>
            </>
          )}
          {item.status === 'queued' && (
            <button
              onClick={() => onCancel(item.id)}
              className="rounded bg-gray-600 px-3 py-1 text-xs font-medium text-gray-200 hover:bg-gray-500"
            >
              Cancel
            </button>
          )}
          {item.status === 'error' && (
            <button
              onClick={() => onRetry(item)}
              className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-700"
            >
              Retry
            </button>
          )}
          {item.status === 'completed' && item.filePath && (
            <button
              onClick={() => onShowInFolder(item.filePath)}
              className="rounded bg-gray-600 px-3 py-1 text-xs font-medium text-gray-200 hover:bg-gray-500"
            >
              Show in folder
            </button>
          )}
          <button
            onClick={() => onRemove(item.id)}
            className="rounded bg-gray-700 px-3 py-1 text-xs font-medium text-gray-400 hover:bg-gray-600 hover:text-gray-200"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
