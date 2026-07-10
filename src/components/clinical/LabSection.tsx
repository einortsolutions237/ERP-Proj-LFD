'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LabOrderForm from './LabOrderForm'
import LabResultForm from './LabResultForm'
import type { LabOrderRow } from '@/lib/clinical/getLabRecords'

export interface LabSectionProps {
  customerId: string
  orders: LabOrderRow[]
  canOrder: boolean
  canEnterResults: boolean
}

export default function LabSection({ customerId, orders, canOrder, canEnterResults }: LabSectionProps) {
  const router = useRouter()
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [resultsOrderId, setResultsOrderId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-ink">Lab orders</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-slate">No lab orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="space-y-2 rounded-md border border-mist p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">{order.testName}</div>
                  <div className="text-xs text-slate">
                    Ordered {new Date(order.orderedAt).toLocaleString()} by {order.doctorName} · {order.status}
                  </div>
                  {order.instructions && <div className="text-xs text-slate">Instructions: {order.instructions}</div>}
                </div>
                {canEnterResults && order.status === 'ordered' && (
                  <button
                    type="button"
                    onClick={() => setResultsOrderId((prev) => (prev === order.id ? null : order.id))}
                    className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist"
                  >
                    Enter results
                  </button>
                )}
              </div>
              {order.result ? (
                <div className="overflow-hidden rounded-md border border-mist">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-mist/40">
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Parameter</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Value</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Unit</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reference range</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Flag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist">
                      {order.result.values.map((v, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-ink">{v.parameter}</td>
                          <td className="px-3 py-2 text-ink">{v.value}</td>
                          <td className="px-3 py-2 text-ink">{v.unit ?? '—'}</td>
                          <td className="px-3 py-2 text-ink">{v.referenceRange ?? '—'}</td>
                          <td className="px-3 py-2 text-ink">{v.flag ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {order.result.notes && (
                    <p className="border-t border-mist px-3 py-2 text-xs text-ink">Note: {order.result.notes}</p>
                  )}
                  <p className="px-3 py-2 text-xs text-slate">
                    Entered {new Date(order.result.enteredAt).toLocaleString()} by {order.result.enteredByName}
                  </p>
                </div>
              ) : (
                resultsOrderId === order.id && (
                  <LabResultForm
                    labOrderId={order.id}
                    onDone={() => {
                      setResultsOrderId(null)
                      router.refresh()
                    }}
                  />
                )
              )}
            </div>
          ))}
        </div>
      )}

      {canOrder && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowOrderForm((prev) => !prev)}
            className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
          >
            Order lab test
          </button>
          {showOrderForm && (
            <LabOrderForm
              customerId={customerId}
              onDone={() => {
                setShowOrderForm(false)
                router.refresh()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
