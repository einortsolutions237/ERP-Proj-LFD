'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PendingDeliveryRow } from '@/lib/pos/getPendingDeliveries'

export interface PendingDeliveriesSectionProps {
  deliveries: PendingDeliveryRow[]
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  fulfilled: 'bg-success/10 text-success',
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
        <p className="text-sm text-slate">No pending deliveries — every sale on record has been fully stocked out.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
                  <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">Qty owed</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {deliveries.map((d) => (
                  <tr key={d.id} className="transition-colors duration-200 hover:bg-mist/40">
                    <td className="max-w-[16rem] truncate px-3 py-2 text-ink" title={d.productName}>
                      {d.productName}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{d.quantityOwed}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[d.status] ?? 'bg-slate/10 text-slate'}`}>
                        {d.status}
                      </span>
                      {d.status === 'fulfilled' && (
                        <span className="ml-2 text-xs text-slate">
                          {d.fulfilledByName ? `by ${d.fulfilledByName}` : ''}{d.fulfilledAt ? ` on ${new Date(d.fulfilledAt).toLocaleString()}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {d.status === 'pending' && (
                        <button
                          type="button"
                          disabled={fulfillingId === d.id}
                          onClick={() => handleFulfill(d.id)}
                          className="min-h-11 rounded-lg border border-mist px-3 text-xs text-ink transition-colors duration-200 hover:bg-mist/40 disabled:opacity-50"
                        >
                          {fulfillingId === d.id ? 'Marking…' : 'Mark fulfilled'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
