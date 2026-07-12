import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SupplierTable, { type SupplierRow } from '@/components/suppliers/SupplierTable'

export default async function SuppliersPage() {
  try {
    await requireCapability('inventory.suppliers.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // Unfiltered on purpose: suppliers are an org-wide catalog collection, not
  // branch-scoped (same reasoning as branches).
  const snap = await getAdminFirestore().collection('suppliers').get()
  const suppliers: SupplierRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? '',
    } as SupplierRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Suppliers</h1>
        <Link href="/suppliers/new" className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50">
          Add supplier
        </Link>
      </div>
      <SupplierTable suppliers={suppliers} />
    </div>
  )
}
