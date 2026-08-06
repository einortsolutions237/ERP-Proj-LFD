import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { randomUUID } from 'node:crypto'
import { resetEmulator } from '../setup/fixtures'

// This project's integration tests invoke Next.js route handlers directly,
// in-process, against the Firebase emulators — `npm test` only boots the
// emulators (firebase emulators:exec ...), it never starts `next dev` /
// `next start`, so nothing listens on localhost:3000 during a test run.
// See tests/integration/sales.test.ts for the established pattern this
// file follows.
import { POST as postSession } from '@/app/api/auth/session/route'

async function createTestUser(role: string, branchId: string) {
  const email = `test-${randomUUID()}@example.com`
  const password = 'Test1234!'
  const userRecord = await getAdminAuth().createUser({ email, password })
  await getAdminAuth().setCustomUserClaims(userRecord.uid, { role, branchId })
  return { uid: userRecord.uid, email, password }
}

async function signInAndGetIdToken(email: string, password: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'fake-key'
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const url = authEmulatorHost
    ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const body = await res.json()
  return body.idToken
}

function sessionRequest(idToken: string, headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ idToken }),
  })
}

describe('POST /api/auth/session', () => {
  beforeAll(async () => {
    await resetEmulator()
  })

  afterEach(async () => {
    const snap = await getAdminFirestore().collection('rateLimits').get()
    await Promise.all(snap.docs.map((d) => d.ref.delete()))
  })

  it('rejects a super_admin session-mint attempt with 403 and writes a login_failed audit entry', async () => {
    const { email, password } = await createTestUser('super_admin', 'branch-1')
    const idToken = await signInAndGetIdToken(email, password)

    const res = await postSession(sessionRequest(idToken))

    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()

    const auditSnap = await getAdminFirestore()
      .collection('auditLogs')
      .where('action', '==', 'login_failed')
      .where('actorEmail', '==', email)
      .get()
    expect(auditSnap.empty).toBe(false)
    const entry = auditSnap.docs[0].data()
    expect(entry.details.source).toBe('session_route')
    expect(entry.details.reason).toBe('strict_role_wrong_path')
  })

  it('allows a non-strict role (cashier) to mint a session normally', async () => {
    const { email, password } = await createTestUser('cashier', 'branch-1')
    const idToken = await signInAndGetIdToken(email, password)

    const res = await postSession(sessionRequest(idToken))

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('__session')
  })

  it('locks out after 5 failed strict-role attempts from the same IP within the window', async () => {
    const { email, password } = await createTestUser('admin', 'branch-1')
    const idToken = await signInAndGetIdToken(email, password)

    for (let i = 0; i < 5; i++) {
      await postSession(sessionRequest(idToken, { 'x-vercel-forwarded-for': '9.9.9.9' }))
    }

    const res = await postSession(sessionRequest(idToken, { 'x-vercel-forwarded-for': '9.9.9.9' }))
    expect(res.status).toBe(429)
  })
})
