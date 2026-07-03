import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import SupplierForm from '@/components/suppliers/SupplierForm'

export default async function NewSupplierPage() {
  try {
    await requireCapability('inventory.suppliers.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Add supplier</h1>
      <SupplierForm mode="create" />
    </div>
  )
}
