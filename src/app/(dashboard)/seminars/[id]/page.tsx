import { redirect, notFound } from 'next/navigation'
import { requireAnyCapability, AuthError } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getSeminarAttendance } from '@/lib/clinical/getSeminarAttendance'
import SeminarDetailClient from '@/components/seminars/SeminarDetailClient'
import type { Seminar } from '@/lib/types/seminar'

export default async function SeminarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let user
  try {
    user = await requireAnyCapability(['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'])
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const doc = await db.collection('seminars').doc(id).get()
  if (!doc.exists) notFound()
  const data = doc.data() as Seminar

  const canManage = hasCapability(user.role, 'seminars.manage')
  const canRecord = hasCapability(user.role, 'seminars.attendance.record')
  const canView = hasCapability(user.role, 'seminars.attendance.view')

  const [attendance, branches, customers, branchDoc] = await Promise.all([
    canView ? getSeminarAttendance({ seminarId: id }, user) : Promise.resolve([]),
    canManage ? db.collection('branches').get() : Promise.resolve(null),
    canRecord ? db.collection('customers').get() : Promise.resolve(null),
    data.branchId ? db.collection('branches').doc(data.branchId).get() : Promise.resolve(null),
  ])

  const seminar = {
    id,
    title: data.title,
    description: data.description,
    scheduledAt: data.scheduledAt.toDate().toISOString(),
    format: data.format,
    branchId: data.branchId,
    branchName: branchDoc?.exists ? (branchDoc.data()?.name as string) : null,
  }

  return (
    <SeminarDetailClient
      seminar={seminar}
      attendance={attendance}
      canManage={canManage}
      canRecord={canRecord}
      canView={canView}
      branches={branches ? branches.docs.map((d) => ({ id: d.id, name: d.data().name as string })) : []}
      customers={
        customers
          ? customers.docs.map((d) => ({ id: d.id, name: d.data().name as string, phone: d.data().phone as string }))
          : []
      }
    />
  )
}
