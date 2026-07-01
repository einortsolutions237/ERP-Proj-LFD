import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'

export async function DELETE(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  try {
    await requireCapability('admin.settings.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('settings').doc(key)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await docRef.delete()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
