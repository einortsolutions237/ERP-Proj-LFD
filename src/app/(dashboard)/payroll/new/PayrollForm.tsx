'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface StaffOption {
  uid: string
  name: string
  role: string
  branchName: string
}

export default function PayrollForm({ staffOptions }: { staffOptions: StaffOption[] }) {
  const router = useRouter()
  const [staffId, setStaffId] = useState(staffOptions[0]?.uid ?? '')
  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [grossAmount, setGrossAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      staffId,
      payPeriodStart,
      payPeriodEnd,
      grossAmount: grossAmount.trim() === '' ? undefined : Number(grossAmount),
      notes: notes.trim() === '' ? undefined : notes,
    }

    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      router.push('/payroll')
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Staff member</label>
        <select
          required
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          {staffOptions.map((s) => (
            <option key={s.uid} value={s.uid}>
              {s.name} — {s.role} — {s.branchName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Pay period start</label>
        <input
          required
          type="date"
          value={payPeriodStart}
          onChange={(e) => setPayPeriodStart(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Pay period end</label>
        <input
          required
          type="date"
          value={payPeriodEnd}
          onChange={(e) => setPayPeriodEnd(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Gross amount</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="Leave blank to use the staff member's base salary"
          value={grossAmount}
          onChange={(e) => setGrossAmount(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Notes</label>
        <textarea
          placeholder="Optional — e.g. &quot;prorated, started mid-month&quot;"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        Record payroll
      </button>
    </form>
  )
}
