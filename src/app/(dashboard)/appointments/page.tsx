import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getAppointments } from '@/lib/clinical/getAppointments'
import AppointmentsTable from '@/components/appointments/AppointmentsTable'

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ doctorUid?: string }>
}) {
  const { doctorUid } = await searchParams

  let user
  try {
    user = await requireCapability('clinical.appointments.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const doctorsSnap = await db.collection('staff').where('role', '==', 'doctor').get()
  const doctors = doctorsSnap.docs.map((d) => {
    const data = d.data()
    return { id: d.id, name: data.name as string }
  })

  const appointments = await getAppointments({ doctorUid: doctorUid || undefined }, user)

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Appointments</h1>
        <Link href="/appointments/new" className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity">
          Book appointment
        </Link>
      </div>

      <form method="GET" className="flex items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-ink">Doctor</label>
          <select
            name="doctorUid"
            defaultValue={doctorUid ?? ''}
            className="rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-mist px-3 py-2 text-sm text-ink transition-colors hover:bg-mist"
        >
          Filter
        </button>
      </form>

      <AppointmentsTable appointments={appointments} />
    </div>
  )
}
