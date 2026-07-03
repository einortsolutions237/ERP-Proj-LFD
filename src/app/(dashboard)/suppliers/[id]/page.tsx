import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SupplierForm from '@/components/suppliers/SupplierForm'
import type { Supplier } from '@/lib/types/supplier'

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    await requireCapability('inventory.suppliers.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const doc = await getAdminFirestore().collection('suppliers').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Supplier

  const initial: Partial<Supplier> = {
    name: data.name,
    contact: data.contact,
    notes: data.notes,
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Edit supplier</h1>
      <SupplierForm mode="edit" supplierId={id} initial={initial} />
    </div>
  )
}
