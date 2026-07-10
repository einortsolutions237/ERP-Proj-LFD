'use client'
import { useState } from 'react'

export interface LabOrderFormProps {
  customerId: string
  // Set when ordering from within a specific treatment record (Task 7's
  // per-treatment-row action in ClinicalSection); omitted/null for
  // standalone ordering from the customer's lab section.
  treatmentId?: string | null
  onDone: () => void
}

export default function LabOrderForm({ customerId, treatmentId, onDone }: LabOrderFormProps) {
  const [testName, setTestName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      customerId,
      testName,
      instructions: instructions.trim() || null,
      treatmentId: treatmentId ?? null,
    }

    try {
      const res = await fetch('/api/lab-orders', {
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
      onDone()
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Test name</label>
        <input
          required
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          placeholder="e.g. Complete Blood Count"
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Instructions (optional)</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        Order lab test
      </button>
    </form>
  )
}
