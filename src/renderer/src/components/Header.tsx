import UpdateBadge from './UpdateBadge'

interface HeaderProps {
  queueInfo: { active: number; queued: number }
  onSettingsClick: () => void
  onDownloadAll: () => void
  onImportClick: () => void
  hasReadyDownloads: boolean
}

export default function Header({
  queueInfo,
  onSettingsClick,
  onDownloadAll,
  onImportClick,
  hasReadyDownloads
}: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-6 py-3">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-red-500">Hire</span>
          <span className="text-gray-100"> Downloader</span>
        </h1>
        <UpdateBadge />
        {queueInfo.active > 0 && (
          <span className="rounded-full bg-gray-700 px-2.5 py-0.5 text-xs text-gray-300">
            {queueInfo.active} active
          </span>
        )}
        {queueInfo.queued > 0 && (
          <span className="rounded-full bg-gray-700 px-2.5 py-0.5 text-xs text-gray-400">
            {queueInfo.queued} queued
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onImportClick}
          className="rounded-lg bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600"
        >
          + Import
        </button>
        <button
          onClick={onDownloadAll}
          disabled={!hasReadyDownloads}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Download All
        </button>
        <button
          onClick={onSettingsClick}
          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
          title="Settings"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>
    </header>
  )
}
