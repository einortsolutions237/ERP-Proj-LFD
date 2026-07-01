import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import BranchForm from '@/components/branches/BranchForm'

export default async function NewBranchPage() {
  try {
    await requireCapability('admin.branches.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Add branch</h1>
      <BranchForm mode="create" />
    </div>
  )
}
