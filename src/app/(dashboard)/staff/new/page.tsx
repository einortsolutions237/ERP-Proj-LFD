import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import StaffForm from '@/components/staff/StaffForm'
import PageHeader from '@/components/ui/PageHeader'

export default async function NewStaffPage() {
  try {
    await requireCapability('admin.staff.create')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <PageHeader title="Add staff member" />
      <StaffForm mode="create" />
    </div>
  )
}
