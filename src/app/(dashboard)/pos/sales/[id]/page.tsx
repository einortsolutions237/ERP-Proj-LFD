import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import VoidSaleButton from '@/components/pos/VoidSaleButton'
import type { Sale } from '@/lib/types/sale'

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let user
  try {
    user = await requireCapability('pos.sale.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const doc = await getAdminFirestore().collection('sales').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Sale
  // Don't reveal that a sale exists in another branch — treat it the same
  // as a genuinely missing doc.
  if (data.branchId !== user.branchId) notFound()

  const createdAt = data.createdAt?.toDate?.().toISOString() ?? ''
  const voidedAt = data.voidedAt?.toDate?.().toISOString() ?? ''

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Sale receipt</h1>
        <p className="text-sm text-gray-500">
          {createdAt ? new Date(createdAt).toLocaleString() : ''} &middot; Cashier {data.cashierUid}
        </p>
        {data.voidedAt ? (
          <div className="mt-2 space-y-1">
            <span className="inline-block rounded bg-red-100 text-red-700 px-2 py-1 text-xs font-medium">
              Voided
            </span>
            <p className="text-sm text-gray-500">
              Voided {voidedAt ? new Date(voidedAt).toLocaleString() : ''} by {data.voidedBy} — {data.voidReason}
            </p>
          </div>
        ) : (
          hasCapability(user.role, 'pos.sale.void') && (
            <div className="mt-2">
              <VoidSaleButton saleId={id} />
            </div>
          )
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Line items</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Unit Price</th>
              <th className="py-2 pr-4">Qty</th>
              <th className="py-2 pr-4">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lineItems.map((line, i) => (
              <tr key={i} className="border-b">
                <td className="py-2 pr-4">{line.name}</td>
                <td className="py-2 pr-4">{line.type}</td>
                <td className="py-2 pr-4">{line.unitPrice.toFixed(2)}</td>
                <td className="py-2 pr-4">{line.quantity}</td>
                <td className="py-2 pr-4">{line.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 text-sm max-w-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span>{data.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Discount</span>
          <span>{data.discountAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tax</span>
          <span>{data.taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{data.total.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Payments</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Amount</th>
              <th className="py-2 pr-4">Reference</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p, i) => (
              <tr key={i} className="border-b">
                <td className="py-2 pr-4">{p.method}</td>
                <td className="py-2 pr-4">{p.amount.toFixed(2)}</td>
                <td className="py-2 pr-4">{p.reference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
