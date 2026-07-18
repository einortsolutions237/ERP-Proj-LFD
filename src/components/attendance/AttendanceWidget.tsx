'use client'
import { useEffect, useState } from 'react'

interface AttendanceMe {
  status: 'checked_in' | 'checked_out'
  checkInAt: string
  checkOutAt: string | null
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString()
}

export default function AttendanceWidget() {
  const [record, setRecord] = useState<AttendanceMe | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function fetchMe() {
    const res = await fetch('/api/attendance/me')
    const body = await res.json()
    setRecord(body)
  }

  useEffect(() => {
    fetchMe()
  }, [])

  async function handleCheckIn() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/attendance/checkin', { method: 'POST' })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error ?? 'Check-in failed')
      setSubmitting(false)
      return
    }
    await fetchMe()
    setSubmitting(false)
  }

  async function handleCheckOut() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/attendance/checkout', { method: 'POST' })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error ?? 'Check-out failed')
      setSubmitting(false)
      return
    }
    await fetchMe()
    setSubmitting(false)
  }

  // Still loading — render nothing rather than blocking the rest of the
  // dashboard.
  if (record === undefined) return null

  if (record === null) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={submitting}
          className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-marine/90 disabled:opacity-50"
        >
          Check In
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  if (record.status === 'checked_in') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate">Checked in at {formatTime(record.checkInAt)}</p>
        <button
          type="button"
          onClick={handleCheckOut}
          disabled={submitting}
          className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-marine/90 disabled:opacity-50"
        >
          Check Out
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-slate">Done for today.</p>
      <p className="text-sm text-slate">
        Checked in at {formatTime(record.checkInAt)} &middot; Checked out at {formatTime(record.checkOutAt)}
      </p>
    </div>
  )
}
