'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface VoidSaleButtonProps {
  saleId: string
}

export default function VoidSaleButton({ saleId }: VoidSaleButtonProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleCancel() {
    setExpanded(false)
    setReason('')
    setError(null)
  }

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/sales/${saleId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Void failed — check your connection and try again.')
        setSubmitting(false)
        return
      }
      router.refresh()
    } catch {
      setError('Void failed — check your connection and try again.')
      setSubmitting(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="min-h-11 rounded-lg bg-danger px-3 text-sm font-medium text-paper transition-opacity duration-200 hover:opacity-90"
      >
        Void sale
      </button>
    )
  }

  return (
    <div className="max-w-sm space-y-3">
      <div>
        <label htmlFor="void-reason" className="block text-sm font-medium text-ink">
          Reason <span className="text-danger">*</span>
        </label>
        <textarea
          id="void-reason"
          required
          aria-required="true"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          rows={3}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || reason.trim().length === 0}
          className="min-h-11 rounded-lg bg-danger px-3 text-sm font-medium text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          {submitting ? 'Voiding…' : 'Confirm void'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
