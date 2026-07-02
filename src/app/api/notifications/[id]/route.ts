import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getSessionUser } from '@/lib/auth/server-guard'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const db = getAdminFirestore()
  const docRef = db.collection('notifications').doc(id)
  const doc = await docRef.get()
  if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = doc.data()!
  // Same 404-not-403 idiom already used for cross-branch staff access in
  // src/app/api/staff/[staffId]/route.ts — don't reveal that a notification
  // belonging to someone else exists.
  if (existing.recipientUid !== user.uid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await docRef.update({ read: true })
  return NextResponse.json({ ok: true })
}
