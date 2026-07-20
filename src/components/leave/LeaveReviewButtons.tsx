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
    try {
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
        setError(body.error ?? 'Could not save — check your connection and try again.')
        setSubmitting(false)
        return
      }
      router.refresh()
    } catch {
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  if (pendingAction === null) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPendingAction('approve')}
          className="min-h-11 rounded-lg bg-marine px-3 text-xs text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setPendingAction('reject')}
          className="min-h-11 rounded-lg border border-danger px-3 text-xs text-danger transition-colors duration-200 hover:bg-danger/10"
        >
          Reject
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-3">
      <div>
        <label htmlFor={`leave-review-note-${requestId}`} className="block text-sm font-medium text-ink">
          Review note
        </label>
        <textarea
          id={`leave-review-note-${requestId}`}
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
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
          disabled={submitting}
          className={
            pendingAction === 'approve'
              ? 'min-h-11 rounded-lg bg-marine px-3 text-xs text-paper transition-opacity duration-200 disabled:opacity-50'
              : 'min-h-11 rounded-lg border border-danger px-3 text-xs text-danger transition-colors duration-200 hover:bg-danger/10 disabled:opacity-50'
          }
        >
          {submitting ? 'Saving…' : pendingAction === 'approve' ? 'Confirm approve' : 'Confirm reject'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="min-h-11 rounded-lg border border-mist px-3 text-xs text-ink transition-colors duration-200 hover:bg-mist/40 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
