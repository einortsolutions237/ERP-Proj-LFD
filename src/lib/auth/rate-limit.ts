import { getAdminFirestore } from '@/lib/firebase/admin'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000

export type RateLimitResult =
  | { status: 'ok' }
  | { status: 'blocked'; retryAfterMs: number }
  | { status: 'unavailable' } // Firestore read failed — caller must fail closed

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  let doc
  try {
    doc = await getAdminFirestore().collection('rateLimits').doc(key).get()
  } catch {
    return { status: 'unavailable' }
  }
  if (!doc.exists) return { status: 'ok' }
  const data = doc.data()!
  const lockedUntil = data.lockedUntil?.toDate?.() as Date | undefined
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return { status: 'blocked', retryAfterMs: lockedUntil.getTime() - Date.now() }
  }
  return { status: 'ok' }
}

export async function recordFailedAttempt(key: string): Promise<void> {
  const ref = getAdminFirestore().collection('rateLimits').doc(key)
  await getAdminFirestore().runTransaction(async (tx) => {
    const doc = await tx.get(ref)
    const now = Date.now()
    if (!doc.exists) {
      tx.set(ref, { key, count: 1, windowStart: new Date(now), lockedUntil: null })
      return
    }
    const data = doc.data()!
    const windowStart = data.windowStart?.toDate?.() as Date | undefined
    const withinWindow = windowStart && now - windowStart.getTime() < WINDOW_MS
    const nextCount = withinWindow ? (data.count ?? 0) + 1 : 1
    const nextWindowStart = withinWindow ? windowStart : new Date(now)
    const lockedUntil = nextCount >= MAX_ATTEMPTS ? new Date(now + LOCKOUT_MS) : null
    tx.set(ref, { key, count: nextCount, windowStart: nextWindowStart, lockedUntil })
  })
}

export async function clearAttempts(key: string): Promise<void> {
  await getAdminFirestore().collection('rateLimits').doc(key).delete()
}
