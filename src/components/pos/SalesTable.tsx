'use client'
import Link from 'next/link'
import type { Sale } from '@/lib/types/sale'

// Server Components can't pass Firestore Timestamp instances to Client
// Components (Next.js only serializes plain objects across that boundary),
// so the list page converts createdAt to an ISO string and drops the raw
// voidedAt Timestamp (a voided sale would otherwise leak one through) before
// handing rows to this table — voided status arrives pre-reduced to a boolean.
export type SaleRow = Omit<Sale, 'createdAt' | 'voidedAt'> & {
  id: string
  createdAt: string
  voided: boolean
}

export default function SalesTable({ sales }: { sales: SaleRow[] }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Date/Time
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Cashier
                </th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">
                  Items
                </th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">
                  Total (FCFA)
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Payment
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Status
                </th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate">
                    No sales recorded yet — completed sales will appear here.
                  </td>
                </tr>
              ) : (
                sales.map((row) => (
                  <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                    <td className="px-3 py-2 text-ink">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-ink" title={row.cashierUid}>
                      {row.cashierUid}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{row.lineItems.length}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{row.total.toFixed(2)}</td>
                    <td className="px-3 py-2 text-ink">{row.payments.map((p) => p.method).join(' + ')}</td>
                    <td className="px-3 py-2">
                      {row.voided && (
                        <span className="inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                          Voided
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/pos/sales/${row.id}`}
                        className="inline-flex min-h-11 items-center text-marine underline underline-offset-2 transition-colors duration-200 hover:text-ink"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
