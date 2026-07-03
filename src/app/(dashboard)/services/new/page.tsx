import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import ServiceForm from '@/components/services/ServiceForm'

export default async function NewServicePage() {
  try {
    await requireCapability('inventory.catalog.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Add service</h1>
      <ServiceForm mode="create" />
    </div>
  )
}
