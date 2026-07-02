import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import CustomerForm from '@/components/customers/CustomerForm'

export default async function NewCustomerPage() {
  try {
    // NOT 'manage' — cashier can reach this screen too.
    await requireCapability('crm.customer.create')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Add customer</h1>
      <CustomerForm mode="create" />
    </div>
  )
}
