'use client'
import { useEffect, useState } from 'react'

// The documented /api/attendance/me contract is checkInAt/checkOutAt as
// ISO strings, but that route returns the raw Firestore Timestamp via
// NextResponse.json, which serializes it as {_seconds, _nanoseconds}
// (verified: it has no toJSON). Accept both shapes here so the widget
// never renders "Invalid Date" — see task-H8-report.md for the API-side
// note; not fixed here since API routes are out of scope for this task.
type SerializedTimestamp = { _seconds: number; _nanoseconds: number }

interface AttendanceMe {
  status: 'checked_in' | 'checked_out'
  checkInAt: string | SerializedTimestamp
  checkOutAt: string | SerializedTimestamp | null
}

function formatTime(value: string | SerializedTimestamp | null | undefined): string {
  if (!value) return '—'
  if (typeof value === 'string') return new Date(value).toLocaleTimeString()
  return new Date(value._seconds * 1000).toLocaleTimeString()
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
          className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          Check In
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    )
  }

  if (record.status === 'checked_in') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-600">Checked in at {formatTime(record.checkInAt)}</p>
        <button
          type="button"
          onClick={handleCheckOut}
          disabled={submitting}
          className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          Check Out
        </button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-zinc-600">Done for today.</p>
      <p className="text-sm text-zinc-600">
        Checked in at {formatTime(record.checkInAt)} &middot; Checked out at {formatTime(record.checkOutAt)}
      </p>
    </div>
  )
}
