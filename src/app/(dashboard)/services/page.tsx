import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import ServiceTable, { type ServiceRow } from '@/components/services/ServiceTable'

export default async function ServicesPage() {
  try {
    await requireCapability('inventory.catalog.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // Unfiltered on purpose: services are an org-wide catalog collection, not
  // branch-scoped (same reasoning as products/suppliers/branches).
  const snap = await getAdminFirestore().collection('services').get()
  const services: ServiceRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? '',
    } as ServiceRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Services</h1>
        <Link href="/services/new" className="bg-black text-white rounded px-3 py-2 text-sm">
          Add service
        </Link>
      </div>
      <ServiceTable services={services} />
    </div>
  )
}
