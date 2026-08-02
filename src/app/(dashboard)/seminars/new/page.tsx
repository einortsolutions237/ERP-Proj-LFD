import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SeminarForm from '@/components/seminars/SeminarForm'
import PageHeader from '@/components/ui/PageHeader'

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
      <PageHeader title="New seminar" />
      <SeminarForm mode="create" branches={branches} />
    </div>
  )
}
