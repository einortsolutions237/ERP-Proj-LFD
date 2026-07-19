'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LabOrderForm from './LabOrderForm'
import LabResultForm from './LabResultForm'
import AttachScanForm from './AttachScanForm'
import type { LabOrderRow } from '@/lib/clinical/getLabRecords'

export interface LabSectionProps {
  customerId: string
  orders: LabOrderRow[]
  canOrder: boolean
  canEnterResults: boolean
}

const ORDER_STATUS_BADGE: Record<string, string> = {
  ordered: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
}

const FLAG_BADGE: Record<string, string> = {
  normal: 'bg-success/10 text-success',
  low: 'bg-warning/10 text-warning',
  high: 'bg-danger/10 text-danger',
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
            <div key={order.id} className="space-y-2 rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">{order.testName}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate">
                    <span>Ordered {new Date(order.orderedAt).toLocaleString()} by {order.doctorName}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_BADGE[order.status] ?? 'bg-slate/10 text-slate'}`}>
                      {order.status}
                    </span>
                  </div>
                  {order.instructions && <div className="text-xs text-slate">Instructions: {order.instructions}</div>}
                </div>
                {canEnterResults && order.status === 'ordered' && (
                  <button
                    type="button"
                    onClick={() => setResultsOrderId((prev) => (prev === order.id ? null : order.id))}
                    className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40"
                  >
                    Enter results
                  </button>
                )}
              </div>
              {order.result ? (
                <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
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
                        <tr key={i} className="hover:bg-mist/40 transition-colors duration-200">
                          <td className="px-3 py-2 text-ink">{v.parameter}</td>
                          <td className="px-3 py-2 font-mono text-right text-ink">{v.value}</td>
                          <td className="px-3 py-2 text-ink">{v.unit ?? '—'}</td>
                          <td className="px-3 py-2 text-ink">{v.referenceRange ?? '—'}</td>
                          <td className="px-3 py-2">
                            {v.flag ? (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${FLAG_BADGE[v.flag] ?? 'bg-slate/10 text-slate'}`}>
                                {v.flag}
                              </span>
                            ) : (
                              <span className="text-ink">—</span>
                            )}
                          </td>
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
                  <div className="space-y-2 border-t border-mist px-3 py-2">
                    {order.result.attachments.length > 0 && (
                      <ul className="space-y-1">
                        {order.result.attachments.map((a) => (
                          <li key={a.id} className="text-xs">
                            <a
                              href={`/api/attachments/${a.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-marine underline"
                            >
                              {a.fileName}
                            </a>
                            <span className="text-slate"> · {new Date(a.createdAt).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {canEnterResults && (
                      <AttachScanForm labResultId={order.result.id} onDone={() => router.refresh()} />
                    )}
                  </div>
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
            className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
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
