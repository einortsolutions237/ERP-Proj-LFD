import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { isBranchLocked } from '@/lib/auth/permissions'
import SalesTable, { type SaleRow } from '@/components/pos/SalesTable'

export default async function SalesLogPage() {
  let user
  try {
    user = await requireCapability('pos.sale.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const snap = isBranchLocked(user.role)
    ? await db.collection('sales').where('branchId', '==', user.branchId).orderBy('createdAt', 'desc').get()
    : await db.collection('sales').orderBy('createdAt', 'desc').get()

  const sales: SaleRow[] = snap.docs.map((d) => {
    const { voidedAt, ...data } = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      voided: voidedAt != null,
    } as SaleRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Sales log</h1>
      <SalesTable sales={sales} />
    </div>
  )
}
