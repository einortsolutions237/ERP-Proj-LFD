import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import DepartmentForm from '@/components/departments/DepartmentForm'

export default async function NewDepartmentPage() {
  try {
    await requireCapability('admin.departments.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Add department</h1>
      <DepartmentForm mode="create" />
    </div>
  )
}
