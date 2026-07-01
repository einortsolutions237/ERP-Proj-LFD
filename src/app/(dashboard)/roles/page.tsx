import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import RoleMatrix from '@/components/roles/RoleMatrix'
import RoleReassignmentTable from '@/components/roles/RoleReassignmentTable'
import type { StaffRow } from '@/components/staff/StaffTable'

export default async function RolesPage() {
  let user
  try {
    user = await requireCapability('admin.roles.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore().collection('staff').where('branchId', '==', user.branchId).get()
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

  // The PATCH endpoint this page calls is guarded server-side by
  // 'admin.staff.edit' (Task 6), not 'admin.roles.assign' — that mismatch is
  // pre-existing and out of scope here. This check only controls whether the
  // reassignment control renders; the server enforces its own guard regardless.
  const canAssign = hasCapability(user.role, 'admin.roles.assign')

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-10">
      <div>
        <h1 className="text-xl font-semibold">Roles & permissions</h1>
        <p className="text-sm text-gray-600 mt-1">
          Capability matrix by role. super_admin is protected and cannot be reassigned or edited from this screen.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Capability matrix</h2>
        <RoleMatrix />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Staff by role</h2>
        <RoleReassignmentTable staff={staff} canAssign={canAssign} />
      </section>
    </div>
  )
}
