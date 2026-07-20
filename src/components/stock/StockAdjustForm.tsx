'use client'
import { useState } from 'react'
import type { StockMovementType } from '@/lib/types/stock'

type AdjustDirection = 'increase' | 'decrease'

export interface StockAdjustFormProps {
  productId: string
  branchId: string
  currentQuantity: number
  onDone: () => void
  onCancel: () => void
}

export default function StockAdjustForm({ productId, branchId, currentQuantity, onDone, onCancel }: StockAdjustFormProps) {
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

  const typeFieldId = `stock-adjust-type-${productId}`
  const directionFieldId = `stock-adjust-direction-${productId}`
  const quantityFieldId = `stock-adjust-quantity-${productId}`
  const reasonFieldId = `stock-adjust-reason-${productId}`

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
      <p className="text-sm text-slate">
        Current quantity: <span className="font-mono text-ink">{currentQuantity}</span>
      </p>
      <div>
        <label htmlFor={typeFieldId} className="block text-sm font-medium text-ink">
          Type
        </label>
        <select
          id={typeFieldId}
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="restock">Restock</option>
          <option value="adjustment">Adjustment</option>
          <option value="waste">Waste</option>
        </select>
      </div>
      {type === 'adjustment' && (
        <div>
          <label htmlFor={directionFieldId} className="block text-sm font-medium text-ink">
            Direction
          </label>
          <select
            id={directionFieldId}
            value={direction}
            onChange={(e) => setDirection(e.target.value as AdjustDirection)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            <option value="increase">Increase</option>
            <option value="decrease">Decrease</option>
          </select>
        </div>
      )}
      <div>
        <label htmlFor={quantityFieldId} className="block text-sm font-medium text-ink">
          Quantity
        </label>
        <input
          id={quantityFieldId}
          required
          type="number"
          min={1}
          step={1}
          value={magnitude}
          onChange={(e) => setMagnitude(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor={reasonFieldId} className="block text-sm font-medium text-ink">
          Reason (optional)
        </label>
        <input
          id={reasonFieldId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Submit'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
