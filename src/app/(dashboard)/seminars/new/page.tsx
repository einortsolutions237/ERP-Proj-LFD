import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SeminarForm from '@/components/seminars/SeminarForm'

export default async function NewSeminarPage() {
  try {
    await requireCapability('seminars.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const branchesSnap = await db.collection('branches').get()
  const branches = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">New seminar</h1>
      <SeminarForm mode="create" branches={branches} />
    </div>
  )
}
