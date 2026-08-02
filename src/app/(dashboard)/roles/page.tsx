import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasEffectiveCapability, isBranchLocked } from '@/lib/auth/permissions'
import { getAllRoleOverrides } from '@/lib/auth/roleOverrides'
import RoleMatrix from '@/components/roles/RoleMatrix'
import RoleReassignmentTable from '@/components/roles/RoleReassignmentTable'
import PageHeader from '@/components/ui/PageHeader'
import type { StaffRow } from '@/components/staff/StaffTable'

export default async function RolesPage() {
  let user
  try {
    user = await requireCapability('admin.roles.view')
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

  // The PATCH endpoint this page calls is guarded server-side by
  // 'admin.staff.edit' (Task 6), not 'admin.roles.assign' — that mismatch is
  // pre-existing and out of scope here. This check only controls whether the
  // reassignment control renders; the server enforces its own guard regardless.
  const canAssign = hasEffectiveCapability(user, 'admin.roles.assign')

  const canManageOverrides = hasEffectiveCapability(user, 'admin.roleOverrides.manage')
  // Anyone who can view this page sees the REAL effective capability set —
  // an override is not confidential relative to the default matrix they
  // already see in full. Only editing stays gated behind canManageOverrides
  // (passed to RoleMatrix separately, unchanged).
  const overrides = await getAllRoleOverrides()

  return (
    <div className="mx-auto mt-12 max-w-7xl space-y-10">
      <div className="max-w-4xl">
        <PageHeader
          title="Roles & permissions"
          description="Capability matrix by role. A super_admin account is protected from every other role and from itself — only a different super_admin can reassign its role here."
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-ink">Capability matrix</h2>
        <RoleMatrix overrides={overrides} canEdit={canManageOverrides} />
      </section>

      <section className="max-w-4xl space-y-3">
        <h2 className="text-lg font-medium text-ink">Staff by role</h2>
        <RoleReassignmentTable staff={staff} canAssign={canAssign} viewerRole={user.role} viewerUid={user.uid} />
      </section>
    </div>
  )
}
