import { useState } from 'react'
import type { HistoryItem } from '../types'

interface HistorySectionProps {
  history: HistoryItem[]
  onRetry: (item: HistoryItem) => void
  onClear: () => void
  onDelete: (id: string) => void
}

const badgeColors: Record<string, string> = {
  YT: 'bg-red-600/20 text-red-400',
  TOR: 'bg-purple-600/20 text-purple-400',
  DL: 'bg-blue-600/20 text-blue-400'
}

export default function HistorySection({ history, onRetry, onClear, onDelete }: HistorySectionProps) {
  const [expanded, setExpanded] = useState(false)

  if (history.length === 0) return null

  return (
    <div className="mt-6 border-t border-gray-700 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm font-medium text-gray-400 transition-colors hover:text-gray-200"
      >
        <span>
          Download History ({history.length})
        </span>
        <svg
          className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3 space-y-1">
          <div className="mb-2 flex justify-end">
            <button
              onClick={onClear}
              className="text-xs text-gray-500 transition-colors hover:text-red-400"
            >
              Clear All
            </button>
          </div>
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-4 w-6 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold ${badgeColors[item.badge] || ''}`}
                  >
                    {item.badge}
                  </span>
                  <span className="truncate text-xs text-gray-300">{item.title}</span>
                </div>
                {item.completedAt && (
                  <p className="mt-0.5 pl-8 text-[10px] text-gray-600">
                    {new Date(item.completedAt).toLocaleDateString()}{' '}
                    {new Date(item.completedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 gap-1">
                <button
                  onClick={() => onRetry(item)}
                  className="rounded px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
                >
                  Retry
                </button>
                <button
                  onClick={() => onDelete(item.id)}
                  className="rounded px-2 py-0.5 text-[11px] text-gray-500 transition-colors hover:bg-gray-700 hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
