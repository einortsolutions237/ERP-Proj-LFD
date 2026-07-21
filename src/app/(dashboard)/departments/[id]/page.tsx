import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { isBranchLocked } from '@/lib/auth/permissions'
import DepartmentForm from '@/components/departments/DepartmentForm'
import type { Department } from '@/lib/types/department'

export default async function EditDepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let user
  try {
    user = await requireCapability('admin.departments.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const doc = await getAdminFirestore().collection('departments').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Department
  // Only a branch-locked role is restricted to its own branch's departments —
  // that restriction doubles as "don't reveal that a department exists in
  // another branch" via the same 404 as a genuinely missing doc. A
  // non-branch-locked role (e.g. general_manager/hr_admin/admin) is org-wide
  // and may edit any branch's department, matching the PATCH/DELETE routes.
  if (isBranchLocked(user.role) && data.branchId !== user.branchId) notFound()

  const initial: Partial<Department> = {
    name: data.name,
    active: data.active,
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Edit department</h1>
      <DepartmentForm mode="edit" departmentId={id} initial={initial} />
    </div>
  )
}
