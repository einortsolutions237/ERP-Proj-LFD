import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import AppointmentForm from '@/components/appointments/AppointmentForm'

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>
}) {
  const { customerId } = await searchParams

  try {
    await requireCapability('clinical.appointments.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const [customersSnap, doctorsSnap] = await Promise.all([
    db.collection('customers').get(),
    db.collection('staff').where('role', '==', 'doctor').get(),
  ])

  const customers = customersSnap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, name: data.name as string, phone: data.phone as string }
  })
  const doctors = doctorsSnap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, name: data.name as string }
  })

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Book appointment</h1>
      <AppointmentForm customers={customers} doctors={doctors} defaultCustomerId={customerId} />
    </div>
  )
}
