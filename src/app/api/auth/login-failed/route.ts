import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit/log'

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({ email: null }))
  await writeAuditLog({
    action: 'login_failed',
    actorUid: null,
    actorEmail: typeof email === 'string' ? email : null,
    details: { source: 'client_reported' },
  })
  return NextResponse.json({ ok: true })
}
