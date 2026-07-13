import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import BranchTable, { type BranchRow } from '@/components/branches/BranchTable'

export default async function BranchesPage() {
  try {
    await requireCapability('admin.branches.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // Unfiltered on purpose: branches don't carry a branchId field (a branch
  // document IS the branch) — admins manage every branch, not just their own.
  const snap = await getAdminFirestore().collection('branches').get()
  const branches: BranchRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? '',
    } as BranchRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Branches</h1>
        <Link href="/branches/new" className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50">
          Add branch
        </Link>
      </div>
      <BranchTable branches={branches} />
    </div>
  )
}
