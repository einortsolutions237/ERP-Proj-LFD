import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import StaffForm from '@/components/staff/StaffForm'
import type { Staff } from '@/lib/types/staff'

// Firestore Timestamp / Date values can't cross the Server->Client Component
// boundary as-is; normalize anything date-shaped down to an ISO string (or
// pass through if it's already a string) before handing data to StaffForm.
function toIsoString(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return ''
}

export default async function EditStaffPage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params

  let user
  try {
    user = await requireCapability('admin.staff.edit')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const doc = await getAdminFirestore().collection('staff').doc(staffId).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Staff
  // Don't reveal that a staff member exists in another branch — treat it the
  // same as a genuinely missing doc.
  if (data.branchId !== user.branchId) notFound()
  // Pass only the plain, serializable fields StaffForm actually renders —
  // uid/branchId/createdBy/createdAt/updatedAt are Admin-SDK/Timestamp-shaped
  // and either unused by the form or unsafe to cross the Server->Client
  // Component boundary unconverted.
  const initial: Partial<Staff> = {
    name: data.name,
    email: data.email,
    role: data.role,
    department: data.department ?? null,
    contact: data.contact ?? { phone: null, address: null },
    emergencyContact: data.emergencyContact ?? { name: null, phone: null, relationship: null },
    qualifications: data.qualifications ?? [],
    employment: {
      status: data.employment?.status ?? 'active',
      startDate: toIsoString(data.employment?.startDate),
    },
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Edit staff member</h1>
      <StaffForm mode="edit" staffId={staffId} initial={initial} />
    </div>
  )
}
