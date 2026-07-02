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
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Date/Time</th>
            <th className="py-2 pr-4">Cashier</th>
            <th className="py-2 pr-4">Items</th>
            <th className="py-2 pr-4">Total</th>
            <th className="py-2 pr-4">Payment</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {sales.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-2 pr-4">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}</td>
              <td className="py-2 pr-4">{row.cashierUid}</td>
              <td className="py-2 pr-4">{row.lineItems.length}</td>
              <td className="py-2 pr-4">{row.total.toFixed(2)}</td>
              <td className="py-2 pr-4">{row.payments.map((p) => p.method).join(' + ')}</td>
              <td className="py-2 pr-4">
                {row.voided && (
                  <span className="inline-block rounded bg-red-100 text-red-700 px-2 py-1 text-xs font-medium">
                    Voided
                  </span>
                )}
              </td>
              <td className="py-2 pr-4">
                <Link href={`/pos/sales/${row.id}`} className="underline">
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
