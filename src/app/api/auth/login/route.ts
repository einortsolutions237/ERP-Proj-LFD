import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { sessionCookieOptions, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'
import { STRICT_AUDIT_ROLES, type RoleId } from '@/lib/auth/permissions'

const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const auth = getAdminAuth()
  let userRecord
  try {
    userRecord = await auth.getUserByEmail(email)
  } catch {
    // Unknown account — don't reveal that. Let the client proceed with its own sign-in attempt.
    return NextResponse.json({ strategy: 'client_sdk' })
  }

  const role = userRecord.customClaims?.role as RoleId | undefined
  const branchId = userRecord.customClaims?.branchId as string | undefined

  if (!role || !STRICT_AUDIT_ROLES.includes(role)) {
    // Not a strict-audit role — identical response shape whether the account exists or not.
    return NextResponse.json({ strategy: 'client_sdk' })
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const signInRes = await fetch(`${IDENTITY_TOOLKIT_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })

  if (!signInRes.ok) {
    await writeAuditLog({ action: 'login_failed', actorUid: userRecord.uid, actorEmail: email, details: { source: 'server_verified', role } })
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (!branchId) {
    await writeAuditLog({ action: 'login_failed', actorUid: userRecord.uid, actorEmail: email, details: { source: 'server_verified', reason: 'no_claims' } })
    return NextResponse.json({ error: 'Account not fully provisioned' }, { status: 403 })
  }

  const { idToken } = await signInRes.json()
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions())

  await writeAuditLog({ action: 'login', actorUid: userRecord.uid, actorEmail: email, branchId, details: { source: 'server_verified', role } })
  return response
}
