import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import BranchForm from '@/components/branches/BranchForm'
import type { Branch } from '@/lib/types/branch'

export default async function EditBranchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    await requireCapability('admin.branches.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const doc = await getAdminFirestore().collection('branches').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Branch

  const initial: Partial<Branch> = {
    name: data.name,
    address: data.address,
    phone: data.phone,
    active: data.active,
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Edit branch</h1>
      <BranchForm mode="edit" branchId={id} initial={initial} />
    </div>
  )
}
