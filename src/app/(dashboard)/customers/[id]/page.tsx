import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAnyCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import DeleteCustomerButton from '@/components/customers/DeleteCustomerButton'
import { getPatientTreatments } from '@/lib/clinical/getPatientTreatments'
import ClinicalSection from '@/components/clinical/ClinicalSection'
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
    user = await requireAnyCapability(['crm.customer.view', 'clinical.record.view'])
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
  const canViewCommercial = hasCapability(user.role, 'crm.customer.view')
  const canViewClinical = hasCapability(user.role, 'clinical.record.view')
  const canCreateTreatment = hasCapability(user.role, 'clinical.record.create')
  const treatments = canViewClinical ? await getPatientTreatments(id, user) : []

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">{data.name}</h1>
        {canManage && (
          <div className="flex items-center gap-3">
            <Link href={`/customers/${id}/edit`} className="text-marine underline-offset-2 hover:underline">
              Edit
            </Link>
            <DeleteCustomerButton customerId={id} customerName={data.name} />
          </div>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <div>
          <span className="text-slate">Phone:</span> <span className="text-ink">{data.phone}</span>
        </div>
        <div>
          <span className="text-slate">Email:</span> <span className="text-ink">{data.email ?? '—'}</span>
        </div>
        <div>
          <span className="text-slate">Address:</span> <span className="text-ink">{data.address ?? '—'}</span>
        </div>
        {canViewCommercial && (
          <div>
            <span className="text-slate">Notes:</span> <span className="text-ink">{data.notes ?? '—'}</span>
          </div>
        )}
      </div>

      {canViewCommercial && (
      <div className="space-y-3">
        <h2 className="text-lg font-medium text-ink">Purchase history</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-slate">No purchases yet.</p>
        ) : (
          <div className="overflow-hidden rounded-md border border-mist">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Items</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Payment</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {purchases.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                    <td className="px-3 py-2 text-ink">{row.createdAt ? new Date(row.createdAt).toLocaleString() : ''}</td>
                    <td className="px-3 py-2 text-ink">{row.itemCount}</td>
                    <td className="px-3 py-2 font-mono text-ink">{row.total.toFixed(2)}</td>
                    <td className="px-3 py-2 text-ink">{row.payments}</td>
                    <td className="px-3 py-2 text-ink">
                      <Link href={`/pos/sales/${row.id}`} className="text-marine underline-offset-2 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {canViewClinical && (
        <ClinicalSection customerId={id} treatments={treatments} canCreate={canCreateTreatment} />
      )}
    </div>
  )
}
