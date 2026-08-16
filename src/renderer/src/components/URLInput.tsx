import { useState, useCallback } from 'react'

interface URLInputProps {
  onAdd: (url: string) => void
}

export default function URLInput({ onAdd }: URLInputProps) {
  const [value, setValue] = useState('')

  const handleFocus = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && !value && /^https?:\/\//i.test(text.trim())) {
        setValue(text.trim())
      }
    } catch {
      // clipboard read may fail without permissions
    }
  }, [value])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = value.trim()
      if (!trimmed) return
      onAdd(trimmed)
      setValue('')
    },
    [value, onAdd]
  )

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={handleFocus}
        placeholder="Paste a URL (YouTube, magnet link, or direct download)..."
        className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-red-500 focus:ring-1 focus:ring-red-500"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    </form>
  )
}
