'use client'
import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'

export interface StockTransferFormProps {
  productId: string
  sourceBranchId: string
  currentQuantity: number
  destinationBranches: { id: string; name: string }[]
  onDone: () => void
  onCancel: () => void
}

export default function StockTransferForm({
  productId,
  sourceBranchId,
  currentQuantity,
  destinationBranches,
  onDone,
  onCancel,
}: StockTransferFormProps) {
  const [destBranchId, setDestBranchId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const uid = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!destBranchId) {
      setError('Destination branch is required')
      return
    }
    const parsedQuantity = Number(quantity)
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError('Quantity must be a positive whole number')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/stock/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          sourceBranchId,
          destBranchId,
          quantity: parsedQuantity,
          reason: reason.trim() || null,
        }),
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

  const destFieldId = `stock-transfer-dest-${uid}`
  const quantityFieldId = `stock-transfer-quantity-${uid}`
  const reasonFieldId = `stock-transfer-reason-${uid}`

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-3">
      <p className="text-sm text-slate">
        Current quantity: <span className="font-mono text-ink">{currentQuantity}</span>
      </p>
      <div>
        <label htmlFor={destFieldId} className="block text-sm font-medium text-ink">
          Destination branch
        </label>
        <select
          id={destFieldId}
          required
          value={destBranchId}
          onChange={(e) => setDestBranchId(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="" disabled>
            Select a branch…
          </option>
          {destinationBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </div>
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
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
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
      {error && <Alert tone="error" inline>{error}</Alert>}
      <div className="flex items-center gap-2">
        <Button type="submit" loading={submitting}>
          Submit
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
