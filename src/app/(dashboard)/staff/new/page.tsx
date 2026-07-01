import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import StaffForm from '@/components/staff/StaffForm'

export default async function NewStaffPage() {
  try {
    await requireCapability('admin.staff.create')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Add staff member</h1>
      <StaffForm mode="create" />
    </div>
  )
}
