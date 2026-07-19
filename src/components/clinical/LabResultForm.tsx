'use client'
import { useState } from 'react'

interface ValueRow {
  parameter: string
  value: string
  unit: string
  referenceRange: string
  flag: '' | 'normal' | 'low' | 'high'
}

const EMPTY_ROW: ValueRow = { parameter: '', value: '', unit: '', referenceRange: '', flag: '' }

export interface LabResultFormProps {
  labOrderId: string
  onDone: () => void
}

export default function LabResultForm({ labOrderId, onDone }: LabResultFormProps) {
  const [rows, setRows] = useState<ValueRow[]>([{ ...EMPTY_ROW }])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateRow(index: number, field: keyof ValueRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }])
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      labOrderId,
      values: rows.map((row) => ({
        parameter: row.parameter,
        value: row.value,
        unit: row.unit.trim() || null,
        referenceRange: row.referenceRange.trim() || null,
        flag: row.flag || null,
      })),
      notes: notes.trim() || null,
    }

    try {
      const res = await fetch('/api/lab-results', {
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
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-5 items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-ink">Parameter</label>
            <input
              required
              value={row.parameter}
              onChange={(e) => updateRow(i, 'parameter', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink">Value</label>
            <input
              required
              value={row.value}
              onChange={(e) => updateRow(i, 'value', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink">Unit</label>
            <input
              value={row.unit}
              onChange={(e) => updateRow(i, 'unit', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink">Reference range</label>
            <input
              value={row.referenceRange}
              onChange={(e) => updateRow(i, 'referenceRange', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink">Flag</label>
              <select
                value={row.flag}
                onChange={(e) => updateRow(i, 'flag', e.target.value)}
                className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
              >
                <option value="">—</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40 disabled:opacity-50"
            >
              −
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40"
      >
        + Add row
      </button>
      <div>
        <label className="block text-xs font-medium text-ink">Feedback / review note (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          Save results
        </button>
      </div>
    </form>
  )
}
