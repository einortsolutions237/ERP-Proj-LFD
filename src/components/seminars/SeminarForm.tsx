'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SeminarFormat } from '@/lib/types/seminar'

export interface SeminarFormProps {
  mode: 'create' | 'edit'
  seminarId?: string
  branches: { id: string; name: string }[]
  initial?: {
    title: string
    description: string | null
    scheduledAt: string
    format: SeminarFormat
    branchId: string | null
  }
  onDone?: () => void
}

export default function SeminarForm({ mode, seminarId, branches, initial, onDone }: SeminarFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ?? '')
  const [format, setFormat] = useState<SeminarFormat>(initial?.format ?? 'physical')
  const [branchId, setBranchId] = useState(initial?.branchId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      title,
      description: description.trim() || null,
      scheduledAt: new Date(scheduledAt).toISOString(),
      format,
      branchId: format === 'online' ? null : branchId,
    }

    try {
      const res = await fetch(mode === 'create' ? '/api/seminars' : `/api/seminars/${seminarId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      if (mode === 'create') {
        router.push(`/seminars/${body.id}`)
      } else {
        onDone?.()
        router.refresh()
      }
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Title</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Date &amp; time</label>
        <input
          required
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Format</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as SeminarFormat)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="physical">Physical</option>
          <option value="online">Online</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>
      {format !== 'online' && (
        <div>
          <label className="block text-sm font-medium text-ink">Branch</label>
          <select
            required
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            <option value="" disabled>
              Select a branch…
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        {mode === 'create' ? 'Create seminar' : 'Save changes'}
      </button>
    </form>
  )
}
