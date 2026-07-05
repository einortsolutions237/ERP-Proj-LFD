'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppointmentRow } from '@/lib/clinical/getAppointments'

export interface AppointmentsTableProps {
  appointments: AppointmentRow[]
}

export default function AppointmentsTable({ appointments }: AppointmentsTableProps) {
  const router = useRouter()
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  async function updateStatus(id: string, status: 'completed' | 'cancelled' | 'no_show', cancellationReason?: string) {
    setError(null)
    setSubmittingId(id)
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
        setError(body.error ?? 'Request failed')
        setSubmittingId(null)
        return
      }
      setCancelingId(null)
      setCancelReason('')
      router.refresh()
    } catch {
      setError('Request failed')
      setSubmittingId(null)
    }
  }

  if (appointments.length === 0) {
    return <p className="text-sm text-slate">No appointments found.</p>
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="overflow-hidden rounded-md border border-mist">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Customer</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Duration</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {appointments.map((row) => (
              <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                <td className="px-3 py-2 text-ink">{new Date(row.scheduledAt).toLocaleString()}</td>
                <td className="px-3 py-2 text-ink">{row.customerName}</td>
                <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                <td className="px-3 py-2 text-ink">{row.durationMinutes} min</td>
                <td className="px-3 py-2 text-ink">{row.status}</td>
                <td className="px-3 py-2 text-ink">
                  {row.status === 'scheduled' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={submittingId === row.id}
                        onClick={() => updateStatus(row.id, 'completed')}
                        className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist disabled:opacity-50"
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        disabled={submittingId === row.id}
                        onClick={() => updateStatus(row.id, 'no_show')}
                        className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist disabled:opacity-50"
                      >
                        No-show
                      </button>
                      {cancelingId === row.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Reason (optional)"
                            className="rounded-md border border-mist bg-paper px-2 py-1 text-xs text-ink placeholder:text-slate focus:border-marine"
                          />
                          <button
                            type="button"
                            disabled={submittingId === row.id}
                            onClick={() => updateStatus(row.id, 'cancelled', cancelReason)}
                            className="rounded-md border border-danger px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                          >
                            Confirm cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCancelingId(row.id)}
                          className="rounded-md border border-danger px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10"
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
  )
}
