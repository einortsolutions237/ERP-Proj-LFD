import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SalesTable, { type SaleRow } from '@/components/pos/SalesTable'

export default async function SalesLogPage() {
  let user
  try {
    user = await requireCapability('pos.sale.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore()
    .collection('sales')
    .where('branchId', '==', user.branchId)
    .orderBy('createdAt', 'desc')
    .get()

  const sales: SaleRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      voided: data.voidedAt != null,
    } as SaleRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Sales log</h1>
      <SalesTable sales={sales} />
    </div>
  )
}
