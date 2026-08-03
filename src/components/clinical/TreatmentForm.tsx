'use client'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'

export interface TreatmentFormProps {
  customerId: string
  onDone: () => void
}

export default function TreatmentForm({ customerId, onDone }: TreatmentFormProps) {
  const [date, setDate] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [prescription, setPrescription] = useState('')
  const [linkedSaleId, setLinkedSaleId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      customerId,
      date,
      diagnosis,
      notes: notes.trim() || null,
      prescription: prescription.trim() || null,
      linkedSaleId: linkedSaleId.trim() || null,
    }

    try {
      const res = await fetch('/api/treatments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not save — check your connection and try again.')
        setSubmitting(false)
        return
      }
      onDone()
    } catch {
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Date</label>
        <input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Diagnosis</label>
        <input
          required
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Prescription (free text)</label>
        <textarea
          value={prescription}
          onChange={(e) => setPrescription(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Linked sale ID (optional)</label>
        <input
          value={linkedSaleId}
          onChange={(e) => setLinkedSaleId(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <Alert tone="error" inline>{error}</Alert>}
      <div className="space-y-1">
        <Button type="submit" loading={submitting}>
          Add treatment
        </Button>
        <p className="text-xs text-slate">This record can&rsquo;t be edited after saving.</p>
      </div>
    </form>
  )
}
