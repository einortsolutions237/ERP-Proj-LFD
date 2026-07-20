'use client'
import { useState, useTransition } from 'react'
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

// Background tint stays per-status/per-flag for at-a-glance scanning; the
// label text itself is always text-ink (never the raw success/warning/danger
// tokens directly), because text-success/text-warning fail WCAG AA (~3.3:1
// and ~3.2:1) at this badge size. A small solid dot carries the same color
// meaning without needing the text itself to be legible in that hue.
const ORDER_STATUS_BG: Record<string, string> = {
  ordered: 'bg-warning/10',
  completed: 'bg-success/10',
}
const ORDER_STATUS_DOT: Record<string, string> = {
  ordered: 'bg-warning',
  completed: 'bg-success',
}

const FLAG_BG: Record<string, string> = {
  normal: 'bg-success/10',
  low: 'bg-warning/10',
  high: 'bg-danger/10',
}
const FLAG_DOT: Record<string, string> = {
  normal: 'bg-success',
  low: 'bg-warning',
  high: 'bg-danger',
}

// "Saved." confirmation dot, same fix as the status badges above.
function SavedNote() {
  return (
    <p className="flex items-center gap-1.5 text-sm text-ink">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
      Saved.
    </p>
  )
}

export default function LabSection({ customerId, orders, canOrder, canEnterResults }: LabSectionProps) {
  const router = useRouter()
  const [isRefreshing, startTransition] = useTransition()
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderSaved, setOrderSaved] = useState(false)
  const [resultsOrderId, setResultsOrderId] = useState<string | null>(null)
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null)

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
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ink ${ORDER_STATUS_BG[order.status] ?? 'bg-slate/10'}`}>
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ORDER_STATUS_DOT[order.status] ?? 'bg-slate'}`} />
                      {order.status}
                    </span>
                  </div>
                  {order.instructions && <div className="text-xs text-slate">Instructions: {order.instructions}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {canEnterResults && order.status === 'ordered' && (
                    <button
                      type="button"
                      onClick={() => setResultsOrderId((prev) => (prev === order.id ? null : order.id))}
                      className="min-h-11 rounded-lg border border-mist px-3 text-xs text-ink transition-colors duration-200 hover:bg-mist/40"
                    >
                      Enter results
                    </button>
                  )}
                  {savedOrderId === order.id && <SavedNote />}
                </div>
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
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ink ${FLAG_BG[v.flag] ?? 'bg-slate/10'}`}>
                                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${FLAG_DOT[v.flag] ?? 'bg-slate'}`} />
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
                      <AttachScanForm
                        labResultId={order.result.id}
                        onDone={() => {
                          setSavedOrderId(order.id)
                          startTransition(() => router.refresh())
                        }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                resultsOrderId === order.id && (
                  <LabResultForm
                    labOrderId={order.id}
                    onDone={() => {
                      setResultsOrderId(null)
                      setSavedOrderId(order.id)
                      startTransition(() => router.refresh())
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowOrderForm((prev) => !prev)
                setOrderSaved(false)
              }}
              className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
            >
              Order lab test
            </button>
            {orderSaved && !showOrderForm && <SavedNote />}
            {isRefreshing && <p className="text-sm text-slate">Updating…</p>}
          </div>
          {showOrderForm && (
            <LabOrderForm
              customerId={customerId}
              onDone={() => {
                setShowOrderForm(false)
                setOrderSaved(true)
                startTransition(() => router.refresh())
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
