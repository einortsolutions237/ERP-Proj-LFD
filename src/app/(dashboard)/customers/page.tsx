import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import CustomerTable, { type CustomerRow } from '@/components/customers/CustomerTable'

export default async function CustomersPage() {
  let user
  try {
    user = await requireCapability('crm.customer.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // Unfiltered on purpose: customers are an org-wide collection, not
  // branch-scoped (same reasoning as products/suppliers/branches).
  const snap = await getAdminFirestore().collection('customers').get()
  const customers: CustomerRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
    }
  })

  const canCreate = hasCapability(user.role, 'crm.customer.create')

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Customers</h1>
        {canCreate && (
          <Link href="/customers/new" className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50">
            Add customer
          </Link>
        )}
      </div>
      <CustomerTable customers={customers} />
    </div>
  )
}
