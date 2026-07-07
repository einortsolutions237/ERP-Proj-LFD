'use client'
import { useEffect, useState } from 'react'

export interface NursingVisitFormProps {
  customerId: string
  onDone: () => void
}

export default function NursingVisitForm({ customerId, onDone }: NursingVisitFormProps) {
  const [questions, setQuestions] = useState<string[] | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [bloodPressure, setBloodPressure] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/intake-questionnaire')
      .then((res) => res.json())
      .then((body) => {
        setQuestions(body.questions)
        setAnswers(new Array(body.questions.length).fill(''))
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const vitals: Record<string, string> = {}
    if (height.trim()) vitals.height = height.trim()
    if (weight.trim()) vitals.weight = weight.trim()
    if (bloodPressure.trim()) vitals.bloodPressure = bloodPressure.trim()

    try {
      const res = await fetch('/api/patient-intake/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, vitals, answers }),
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

  if (questions === null) return <p className="text-sm text-slate">Loading questionnaire…</p>

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-sm font-medium text-ink">Height</label>
          <input
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">Weight</label>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">Blood pressure</label>
          <input
            value={bloodPressure}
            onChange={(e) => setBloodPressure(e.target.value)}
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-slate">No intake questions configured yet.</p>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={i}>
              <label className="block text-sm font-medium text-ink">{q}</label>
              <textarea
                value={answers[i] ?? ''}
                onChange={(e) => setAnswers((prev) => prev.map((a, idx) => (idx === i ? e.target.value : a)))}
                className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        Record visit
      </button>
    </form>
  )
}
