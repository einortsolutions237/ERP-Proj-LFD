import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { sessionCookieOptions, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'
import { STRICT_AUDIT_ROLES, type RoleId } from '@/lib/auth/permissions'
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '@/lib/auth/rate-limit'

export async function POST(request: Request) {
  const { idToken } = await request.json()
  if (!idToken) {
    return NextResponse.json({ error: 'ID token required' }, { status: 400 })
  }

  const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipKey = `session:ip:${ip}`

  const ipLimit = await checkRateLimit(ipKey)
  if (ipLimit.status === 'unavailable') {
    return NextResponse.json({ error: 'Login temporarily unavailable, please try again' }, { status: 503 })
  }
  if (ipLimit.status === 'blocked') {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  let decoded
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true)
  } catch {
    await recordFailedAttempt(ipKey).catch(() => {})
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const role = decoded.role as RoleId | undefined
  const branchId = decoded.branchId as string | undefined
  const emailKey = `session:email:${(decoded.email ?? '').toLowerCase()}`

  if (!role || !branchId) {
    await writeAuditLog({ action: 'login_failed', actorUid: decoded.uid, actorEmail: decoded.email ?? null, details: { source: 'session_route', reason: 'no_claims' } })
    return NextResponse.json({ error: 'Account not fully provisioned' }, { status: 403 })
  }

  if (STRICT_AUDIT_ROLES.includes(role)) {
    await Promise.all([recordFailedAttempt(emailKey), recordFailedAttempt(ipKey)]).catch(() => {})
    await writeAuditLog({
      action: 'login_failed',
      actorUid: decoded.uid,
      actorEmail: decoded.email ?? null,
      branchId,
      details: { source: 'session_route', reason: 'strict_role_wrong_path', role },
    })
    return NextResponse.json({ error: 'This account must sign in through the standard login form' }, { status: 403 })
  }

  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions())

  await clearAttempts(ipKey).catch(() => {})
  await writeAuditLog({ action: 'login', actorUid: decoded.uid, actorEmail: decoded.email ?? null, branchId, details: { source: 'client_sdk' } })
  return response
}
