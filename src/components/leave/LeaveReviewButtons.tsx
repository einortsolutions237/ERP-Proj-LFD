'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface LeaveReviewButtonsProps {
  requestId: string
}

export default function LeaveReviewButtons({ requestId }: LeaveReviewButtonsProps) {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleCancel() {
    setPendingAction(null)
    setReviewNote('')
    setError(null)
  }

  async function handleConfirm() {
    setSubmitting(true)
    setError(null)
    const res = await fetch(`/api/leave-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: pendingAction === 'approve' ? 'approved' : 'rejected',
        reviewNote: reviewNote.trim() ? reviewNote : null,
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error ?? 'Request failed')
      setSubmitting(false)
      return
    }
    router.refresh()
  }

  if (pendingAction === null) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPendingAction('approve')}
          className="bg-black text-white rounded px-3 py-2 text-sm"
        >
          Approve
        </button>
        <button type="button" onClick={() => setPendingAction('reject')} className="border rounded px-3 py-2 text-sm">
          Reject
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-3">
      <div>
        <label className="block text-sm font-medium">Review note</label>
        <textarea
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          className="w-full border rounded px-3 py-2"
          rows={3}
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={
            pendingAction === 'approve'
              ? 'bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50'
              : 'border rounded px-3 py-2 text-sm disabled:opacity-50'
          }
        >
          {pendingAction === 'approve' ? 'Confirm approve' : 'Confirm reject'}
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
