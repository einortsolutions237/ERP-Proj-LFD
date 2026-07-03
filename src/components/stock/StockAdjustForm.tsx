'use client'
import { useState } from 'react'
import type { StockMovementType } from '@/lib/types/stock'

type AdjustDirection = 'increase' | 'decrease'

export interface StockAdjustFormProps {
  productId: string
  branchId: string
  onDone: () => void
}

export default function StockAdjustForm({ productId, branchId, onDone }: StockAdjustFormProps) {
  const [type, setType] = useState<Extract<StockMovementType, 'restock' | 'adjustment' | 'waste'>>('restock')
  const [direction, setDirection] = useState<AdjustDirection>('increase')
  const [magnitude, setMagnitude] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsedMagnitude = Number(magnitude)
    if (!Number.isInteger(parsedMagnitude) || parsedMagnitude <= 0) {
      setError('Quantity must be a positive whole number')
      return
    }

    let quantityDelta: number
    if (type === 'restock') quantityDelta = parsedMagnitude
    else if (type === 'waste') quantityDelta = -parsedMagnitude
    else quantityDelta = direction === 'increase' ? parsedMagnitude : -parsedMagnitude

    setSubmitting(true)
    try {
      const res = await fetch('/api/stock/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, branchId, type, quantityDelta, reason: reason.trim() || null }),
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
    <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
      <div>
        <label className="block text-sm font-medium text-ink">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="restock">Restock</option>
          <option value="adjustment">Adjustment</option>
          <option value="waste">Waste</option>
        </select>
      </div>
      {type === 'adjustment' && (
        <div>
          <label className="block text-sm font-medium text-ink">Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as AdjustDirection)}
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
          </select>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-ink">Quantity</label>
        <input
          required
          type="number"
          min={1}
          step={1}
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 font-mono text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Reason (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        Submit
      </button>
    </form>
  )
}
