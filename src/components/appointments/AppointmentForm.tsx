'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface AppointmentFormProps {
  customers: { id: string; name: string; phone: string }[]
  doctors: { id: string; name: string }[]
  defaultCustomerId?: string
}

export default function AppointmentForm({ customers, doctors, defaultCustomerId }: AppointmentFormProps) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '')
  const [customerSearch, setCustomerSearch] = useState('')
  const [doctorUid, setDoctorUid] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('30')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const customerQuery = customerSearch.trim().toLowerCase()
  const filteredCustomers = customerQuery
    ? customers.filter((c) => c.name.toLowerCase().includes(customerQuery) || c.phone.toLowerCase().includes(customerQuery))
    : customers

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          doctorUid,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: Number(durationMinutes),
          reason: reason.trim() || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      router.push('/appointments')
      router.refresh()
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Customer</label>
        <input
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="mb-2 w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
        <select
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="" disabled>
            Select a customer…
          </option>
          {filteredCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.phone})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Doctor</label>
        <select
          required
          value={doctorUid}
          onChange={(e) => setDoctorUid(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="" disabled>
            Select a doctor…
          </option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Date &amp; time</label>
        <input
          required
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Duration (minutes)</label>
        <input
          required
          type="number"
          min={5}
          step={5}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Reason for visit (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        Book appointment
      </button>
    </form>
  )
}
