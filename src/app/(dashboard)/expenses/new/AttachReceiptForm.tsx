'use client'
import { useState, useRef } from 'react'

export interface AttachReceiptFormProps {
  expenseId: string
  onUploaded: (fileName: string) => void
}

export default function AttachReceiptForm({ expenseId, onUploaded }: AttachReceiptFormProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Choose a file first')
      return
    }
    setError(null)
    setUploading(true)

    const formData = new FormData()
    formData.set('relatedCollection', 'expenses')
    formData.set('relatedDocId', expenseId)
    formData.set('file', file)

    try {
      const res = await fetch('/api/attachments', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Upload failed')
        setUploading(false)
        return
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
      setUploading(false)
      onUploaded(file.name)
    } catch {
      setError('Upload failed')
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="text-xs text-ink"
      />
      <button
        type="submit"
        disabled={uploading}
        className="shrink-0 rounded-lg border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40 disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Attach receipt'}
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  )
}
