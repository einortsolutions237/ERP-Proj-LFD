'use client'
import { useState } from 'react'
import type { AttendanceMethod } from '@/lib/types/seminarAttendance'

export interface AttendanceFormProps {
  seminarId: string
  customers: { id: string; name: string; phone: string }[]
  onDone: () => void
}

export default function AttendanceForm({ seminarId, customers, onDone }: AttendanceFormProps) {
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [method, setMethod] = useState<AttendanceMethod>('physical')
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
      const res = await fetch('/api/seminar-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seminarId, customerId, method }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      setCustomerId('')
      setCustomerSearch('')
      setSubmitting(false)
      onDone()
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
        <label className="block text-sm font-medium text-ink">Attended via</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as AttendanceMethod)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="physical">Physical</option>
          <option value="online">Online</option>
        </select>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        Record attendance
      </button>
    </form>
  )
}
