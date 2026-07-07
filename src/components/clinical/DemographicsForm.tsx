'use client'
import { useState } from 'react'

export interface DemographicsFormProps {
  customerId: string
  initial: { maritalStatus: string | null; religion: string | null; occupation: string | null; referralName: string | null } | null
  onDone: () => void
}

export default function DemographicsForm({ customerId, initial, onDone }: DemographicsFormProps) {
  const [maritalStatus, setMaritalStatus] = useState(initial?.maritalStatus ?? '')
  const [religion, setReligion] = useState(initial?.religion ?? '')
  const [occupation, setOccupation] = useState(initial?.occupation ?? '')
  const [referralName, setReferralName] = useState(initial?.referralName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/patient-intake/demographics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          maritalStatus: maritalStatus.trim() || null,
          religion: religion.trim() || null,
          occupation: occupation.trim() || null,
          referralName: referralName.trim() || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      onDone()
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Marital status</label>
        <input
          value={maritalStatus}
          onChange={(e) => setMaritalStatus(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Religion</label>
        <input
          value={religion}
          onChange={(e) => setReligion(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Occupation</label>
        <input
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Referral name</label>
        <input
          value={referralName}
          onChange={(e) => setReferralName(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        Save demographics
      </button>
    </form>
  )
}
