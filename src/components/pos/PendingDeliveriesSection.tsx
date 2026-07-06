'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PendingDeliveryRow } from '@/lib/pos/getPendingDeliveries'

export interface PendingDeliveriesSectionProps {
  deliveries: PendingDeliveryRow[]
}

export default function PendingDeliveriesSection({ deliveries }: PendingDeliveriesSectionProps) {
  const router = useRouter()
  const [fulfillingId, setFulfillingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFulfill(id: string) {
    setError(null)
    setFulfillingId(id)
    try {
      const res = await fetch(`/api/pending-deliveries/${id}/fulfill`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not mark this delivery as fulfilled — check your connection and try again.')
        return
      }
      router.refresh()
    } finally {
      setFulfillingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-ink">Pending deliveries</h2>
      {deliveries.length === 0 ? (
        <p className="text-sm text-slate">No pending deliveries.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-mist">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Qty owed</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-mist/40 transition-colors">
                  <td className="px-3 py-2 text-ink">{d.productName}</td>
                  <td className="px-3 py-2 font-mono text-ink">{d.quantityOwed}</td>
                  <td className="px-3 py-2 text-ink">
                    {d.status === 'fulfilled'
                      ? `Fulfilled${d.fulfilledByName ? ` by ${d.fulfilledByName}` : ''}${d.fulfilledAt ? ` on ${new Date(d.fulfilledAt).toLocaleString()}` : ''}`
                      : 'Pending'}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    {d.status === 'pending' && (
                      <button
                        type="button"
                        disabled={fulfillingId === d.id}
                        onClick={() => handleFulfill(d.id)}
                        className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist disabled:opacity-50"
                      >
                        Mark fulfilled
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
