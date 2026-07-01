import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { sessionCookieOptions, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'

export async function POST(request: Request) {
  const { idToken } = await request.json()
  if (!idToken) {
    return NextResponse.json({ error: 'ID token required' }, { status: 400 })
  }

  let decoded
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const role = decoded.role as string | undefined
  const branchId = decoded.branchId as string | undefined
  if (!role || !branchId) {
    return NextResponse.json({ error: 'Account not fully provisioned' }, { status: 403 })
  }

  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions())

  await writeAuditLog({ action: 'login', actorUid: decoded.uid, actorEmail: decoded.email ?? null, branchId })
  return response
}
