'use client'
import { useState } from 'react'

export interface StockTransferFormProps {
  productId: string
  sourceBranchId: string
  destinationBranches: { id: string; name: string }[]
  onDone: () => void
}

export default function StockTransferForm({
  productId,
  sourceBranchId,
  destinationBranches,
  onDone,
}: StockTransferFormProps) {
  const [destBranchId, setDestBranchId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
        <label className="block text-sm font-medium">Destination branch</label>
        <select
          required
          value={destBranchId}
          onChange={(e) => setDestBranchId(e.target.value)}
          className="w-full border rounded px-3 py-2"
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
        <label className="block text-sm font-medium">Quantity</label>
        <input
          required
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Reason (optional)</label>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={submitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        Submit
      </button>
    </form>
  )
}
