import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/server-guard'
import { sessionCookieOptions } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'

export async function POST() {
  const user = await getSessionUser()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, '', { ...sessionCookieOptions(), maxAge: 0 })
  if (user) {
    await writeAuditLog({ action: 'logout', actorUid: user.uid, actorEmail: user.email, branchId: user.branchId })
  }
  return response
}
