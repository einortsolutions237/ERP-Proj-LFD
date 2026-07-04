import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { isBranchLocked } from '@/lib/auth/permissions'
import DepartmentTable, { type DepartmentRow } from '@/components/departments/DepartmentTable'

export default async function DepartmentsPage() {
  let user
  try {
    user = await requireCapability('admin.departments.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const collection = getAdminFirestore().collection('departments')
  const snap = isBranchLocked(user.role)
    ? await collection.where('branchId', '==', user.branchId).get()
    : await collection.get()
  const departments: DepartmentRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? '',
    } as DepartmentRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Departments</h1>
        <Link href="/departments/new" className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50">
          Add department
        </Link>
      </div>
      <DepartmentTable departments={departments} />
    </div>
  )
}
