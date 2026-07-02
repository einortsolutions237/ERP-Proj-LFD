import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import CustomerForm from '@/components/customers/CustomerForm'
import type { Customer } from '@/lib/types/customer'

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    await requireCapability('crm.customer.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const doc = await getAdminFirestore().collection('customers').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Customer

  const initial: Partial<Customer> = {
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    notes: data.notes,
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Edit customer</h1>
      <CustomerForm mode="edit" customerId={id} initial={initial} />
    </div>
  )
}
