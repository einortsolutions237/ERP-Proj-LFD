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
    const res = await fetch(`/api/sales/${saleId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error ?? 'Void failed')
      setSubmitting(false)
      return
    }
    router.refresh()
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="bg-red-600 text-white rounded px-3 py-2 text-sm"
      >
        Void sale
      </button>
    )
  }

  return (
    <div className="max-w-sm space-y-3">
      <div>
        <label className="block text-sm font-medium">
          Reason <span className="text-red-600">*</span>
        </label>
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border rounded px-3 py-2"
          rows={3}
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || reason.trim().length === 0}
          className="bg-red-600 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          Confirm void
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="border rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
