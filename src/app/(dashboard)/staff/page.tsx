import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { isBranchLocked } from '@/lib/auth/permissions'
import StaffTable, { type StaffRow } from '@/components/staff/StaffTable'

export default async function StaffPage() {
  let user
  try {
    user = await requireCapability('admin.staff.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const collection = getAdminFirestore().collection('staff')
  const snap = isBranchLocked(user.role)
    ? await collection.where('branchId', '==', user.branchId).get()
    : await collection.get()
  const staff: StaffRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? '',
      employment: {
        status: data.employment?.status ?? 'active',
        startDate: data.employment?.startDate?.toDate?.().toISOString() ?? data.employment?.startDate ?? '',
      },
    } as StaffRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Staff</h1>
        <Link href="/staff/new" className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50">
          Add staff member
        </Link>
      </div>
      <StaffTable staff={staff} />
    </div>
  )
}
