import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import PayrollForm from './PayrollForm'

export default async function NewPayrollPage() {
  try {
    await requireCapability('payroll.record.create')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // Read staff/branches directly rather than requiring admin.staff.view —
  // see the plan's Decision 7. Name/role/branch only, no salary data.
  const db = getAdminFirestore()
  const [staffSnap, branchesSnap] = await Promise.all([db.collection('staff').get(), db.collection('branches').get()])
  const branchNameById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))
  const staffOptions = staffSnap.docs
    .map((d) => {
      const data = d.data()
      return { uid: d.id, name: data.name as string, role: data.role as string, branchName: branchNameById.get(data.branchId) ?? data.branchId }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Record payroll</h1>
      <PayrollForm staffOptions={staffOptions} />
    </div>
  )
}
