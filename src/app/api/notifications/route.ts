import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getSessionUser } from '@/lib/auth/server-guard'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const snap = await getAdminFirestore()
    .collection('notifications')
    .where('recipientUid', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()

  return NextResponse.json(
    snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        type: data.type,
        title: data.title,
        body: data.body,
        relatedId: data.relatedId,
        read: data.read,
        createdAt: data.createdAt.toDate().toISOString(),
      }
    })
  )
}
