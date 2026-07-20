'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppointmentRow } from '@/lib/clinical/getAppointments'

export interface AppointmentsTableProps {
  appointments: AppointmentRow[]
}

// Background tint stays per-status for at-a-glance scanning; the label text
// itself is text-ink (never text-success/text-warning directly), since those
// two tokens fail WCAG AA (~3.3:1/~3.2:1) at this badge size — matches the
// same status badge on the customer detail page.
const STATUS_BG: Record<string, string> = {
  scheduled: 'bg-info/10',
  completed: 'bg-success/10',
  cancelled: 'bg-danger/10',
  no_show: 'bg-slate/10',
}
const STATUS_DOT: Record<string, string> = {
  scheduled: 'bg-info',
  completed: 'bg-success',
  cancelled: 'bg-danger',
  no_show: 'bg-slate',
}

export default function AppointmentsTable({ appointments }: AppointmentsTableProps) {
  const router = useRouter()
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [submittingAction, setSubmittingAction] = useState<'completed' | 'cancelled' | 'no_show' | null>(null)

  async function updateStatus(id: string, status: 'completed' | 'cancelled' | 'no_show', cancellationReason?: string) {
    setError(null)
    setSubmittingId(id)
    setSubmittingAction(status)
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          status === 'cancelled' ? { status, cancellationReason: cancellationReason || null } : { status }
        ),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not update — check your connection and try again.')
        setSubmittingId(null)
        setSubmittingAction(null)
        return
      }
      setCancelingId(null)
      setCancelReason('')
      router.refresh()
    } catch {
      setError('Could not update — check your connection and try again.')
      setSubmittingId(null)
      setSubmittingAction(null)
    }
  }

  if (appointments.length === 0) {
    return <p className="text-sm text-slate">No appointments found.</p>
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Customer</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Duration</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {appointments.map((row) => (
                <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                  <td className="px-3 py-2 text-ink">{new Date(row.scheduledAt).toLocaleString()}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-ink" title={row.customerName}>
                    {row.customerName}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-ink" title={row.doctorName}>
                    {row.doctorName}
                  </td>
                  <td className="px-3 py-2 text-ink">{row.durationMinutes} min</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ink ${STATUS_BG[row.status] ?? 'bg-slate/10'}`}>
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[row.status] ?? 'bg-slate'}`} />
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink">
                    {row.status === 'scheduled' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={submittingId === row.id}
                          onClick={() => updateStatus(row.id, 'completed')}
                          className="min-h-11 rounded-lg border border-mist px-3 text-xs text-ink transition-colors duration-200 hover:bg-mist disabled:opacity-50"
                        >
                          {submittingId === row.id && submittingAction === 'completed' ? 'Completing…' : 'Complete'}
                        </button>
                        <button
                          type="button"
                          disabled={submittingId === row.id}
                          onClick={() => updateStatus(row.id, 'no_show')}
                          className="min-h-11 rounded-lg border border-mist px-3 text-xs text-ink transition-colors duration-200 hover:bg-mist disabled:opacity-50"
                        >
                          {submittingId === row.id && submittingAction === 'no_show' ? 'Marking…' : 'No-show'}
                        </button>
                        {cancelingId === row.id ? (
                          <div className="flex items-center gap-2">
                            <label htmlFor={`cancel-reason-${row.id}`} className="sr-only">
                              Cancellation reason
                            </label>
                            <input
                              id={`cancel-reason-${row.id}`}
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              placeholder="Reason (optional)"
                              className="rounded-lg border border-mist bg-paper px-2 py-1 text-xs text-ink placeholder:text-slate focus:border-marine"
                            />
                            <button
                              type="button"
                              disabled={submittingId === row.id}
                              onClick={() => updateStatus(row.id, 'cancelled', cancelReason)}
                              className="min-h-11 rounded-lg border border-danger px-3 text-xs text-danger transition-colors duration-200 hover:bg-danger/10 disabled:opacity-50"
                            >
                              {submittingId === row.id && submittingAction === 'cancelled' ? 'Cancelling…' : 'Confirm cancel'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCancelingId(row.id)}
                            className="min-h-11 rounded-lg border border-danger px-3 text-xs text-danger transition-colors duration-200 hover:bg-danger/10"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
