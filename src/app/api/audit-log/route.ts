import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'

export async function GET() {
  try {
    await requireCapability('admin.auditLog.view')
    const snap = await getAdminFirestore().collection('auditLogs').orderBy('createdAt', 'desc').limit(200).get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
