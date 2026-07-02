import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import DeleteCustomerButton from '@/components/customers/DeleteCustomerButton'
import type { Customer } from '@/lib/types/customer'
import type { Sale } from '@/lib/types/sale'

// Purchase-history rows are built field-by-field from the raw sale doc below
// (never spread) so a Firestore Timestamp can never leak into this page's
// render — and since this page is a Server Component that renders the table
// itself (no client component involved), there's no serialization boundary
// to cross for these values at all.
interface PurchaseRow {
  id: string
  createdAt: string
  itemCount: number
  total: number
  payments: string
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let user
  try {
    user = await requireCapability('crm.customer.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const doc = await db.collection('customers').doc(id).get()
  if (!doc.exists) notFound()
  const data = doc.data() as Customer

  // Branch-scoped, matching every other branch-scoped read in this app —
  // there is no cross-branch exception.
  const salesSnap = await db
    .collection('sales')
    .where('customerId', '==', id)
    .where('branchId', '==', user.branchId)
    .orderBy('createdAt', 'desc')
    .get()

  const purchases: PurchaseRow[] = salesSnap.docs.map((d) => {
    const sale = d.data() as Sale
    return {
      id: d.id,
      createdAt: sale.createdAt?.toDate?.().toISOString() ?? '',
      itemCount: sale.lineItems.length,
      total: sale.total,
      payments: sale.payments.map((p) => p.method).join(' + '),
    }
  })

  const canManage = hasCapability(user.role, 'crm.customer.manage')

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{data.name}</h1>
        {canManage && (
          <div className="flex items-center gap-3">
            <Link href={`/customers/${id}/edit`} className="underline text-sm">
              Edit
            </Link>
            <DeleteCustomerButton customerId={id} customerName={data.name} />
          </div>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <div>
          <span className="text-gray-500">Phone:</span> {data.phone}
        </div>
        <div>
          <span className="text-gray-500">Email:</span> {data.email ?? '—'}
        </div>
        <div>
          <span className="text-gray-500">Address:</span> {data.address ?? '—'}
        </div>
        <div>
          <span className="text-gray-500">Notes:</span> {data.notes ?? '—'}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Purchase history</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-gray-500">No purchases yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Date/Time</th>
                <th className="py-2 pr-4">Items</th>
                <th className="py-2 pr-4">Total</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {purchases.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-4">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}</td>
                  <td className="py-2 pr-4">{row.itemCount}</td>
                  <td className="py-2 pr-4">{row.total.toFixed(2)}</td>
                  <td className="py-2 pr-4">{row.payments}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/pos/sales/${row.id}`} className="underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
