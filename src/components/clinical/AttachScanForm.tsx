'use client'
import { useState, useRef } from 'react'

export interface AttachScanFormProps {
  labResultId: string
  onDone: () => void
}

export default function AttachScanForm({ labResultId, onDone }: AttachScanFormProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fieldId = `attach-scan-file-${labResultId}`

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
    formData.set('relatedCollection', 'labResults')
    formData.set('relatedDocId', labResultId)
    formData.set('file', file)

    try {
      const res = await fetch('/api/attachments', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Upload failed — check your connection and try again.')
        setUploading(false)
        return
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
      setUploading(false)
      onDone()
    } catch {
      setError('Upload failed — check your connection and try again.')
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-2">
      <label htmlFor={fieldId} className="sr-only">
        Scan file (JPEG, PNG, or PDF)
      </label>
      <input
        id={fieldId}
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        className="text-xs text-ink"
      />
      <button
        type="submit"
        disabled={uploading}
        className="min-h-11 shrink-0 rounded-md border border-mist px-3 text-xs text-ink transition-colors hover:bg-mist/40 disabled:opacity-50"
      >
        {uploading ? 'Uploading…' : 'Attach scan'}
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
