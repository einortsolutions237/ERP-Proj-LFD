import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import ServiceForm from '@/components/services/ServiceForm'
import type { Service } from '@/lib/types/service'

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    await requireCapability('inventory.catalog.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const doc = await db.collection('services').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Service

  const initial: Partial<Service> = {
    name: data.name,
    category: data.category,
    price: data.price,
    durationMinutes: data.durationMinutes,
    description: data.description,
    active: data.active,
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Edit service</h1>
      <ServiceForm mode="edit" serviceId={id} initial={initial} />
    </div>
  )
}
