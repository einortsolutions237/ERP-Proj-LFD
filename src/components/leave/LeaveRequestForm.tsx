'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LeaveType } from '@/lib/types/leave-request'

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'unpaid', 'other']

export default function LeaveRequestForm() {
  const router = useRouter()
  const [type, setType] = useState<LeaveType>('annual')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (endDate < startDate) {
      setError('End date can’t be before the start date.')
      return
    }

    setSubmitting(true)

    const payload = {
      type,
      startDate,
      endDate,
      reason: reason.trim() ? reason : null,
    }

    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not submit — check your connection and try again.')
        setSubmitting(false)
        return
      }
      setType('annual')
      setStartDate('')
      setEndDate('')
      setReason('')
      setSubmitting(false)
      router.refresh()
    } catch {
      setError('Could not submit — check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="leave-type" className="block text-sm font-medium text-ink">
          Type
        </label>
        <select
          id="leave-type"
          value={type}
          onChange={(e) => setType(e.target.value as LeaveType)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="leave-start-date" className="block text-sm font-medium text-ink">
          Start date
        </label>
        <input
          id="leave-start-date"
          required
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="leave-end-date" className="block text-sm font-medium text-ink">
          End date
        </label>
        <input
          id="leave-end-date"
          required
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="leave-reason" className="block text-sm font-medium text-ink">
          Reason
        </label>
        <textarea
          id="leave-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  )
}
