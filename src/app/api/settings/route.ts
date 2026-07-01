import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError, type SessionUser } from '@/lib/auth/server-guard'

// Doc ID IS the key, so this also guards against path-injection-style
// weirdness in Firestore doc IDs (e.g. keys containing '/').
const KEY_PATTERN = /^[a-z0-9_.]+$/

function isValidKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_PATTERN.test(value)
}

function isValidValue(value: unknown): value is string | number | boolean {
  return (
    (typeof value === 'string' && value.trim().length > 0) ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'boolean'
  )
}

export async function GET() {
  try {
    await requireCapability('admin.settings.manage')
    // Phase 1 is global-only — every setting doc has branchId: null, so the
    // whole collection is one flat key-value store with no where() filter.
    const snap = await getAdminFirestore().collection('settings').get()
    return NextResponse.json(snap.docs.map((d) => d.data()))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

async function upsert(user: SessionUser, request: Request) {
  const body = await request.json()

  if (!isValidKey(body.key)) {
    return NextResponse.json({ error: 'key must match /^[a-z0-9_.]+$/' }, { status: 400 })
  }
  if (!isValidValue(body.value)) {
    return NextResponse.json({ error: 'value must be a non-empty string, a finite number, or a boolean' }, { status: 400 })
  }

  // Doc ID = key: the collection is a key-value store, so create and edit are
  // the same operation (an upsert), not two separate code paths.
  const settingData = {
    key: body.key,
    value: typeof body.value === 'string' ? body.value.trim() : body.value,
    branchId: null,
    updatedAt: new Date(),
    updatedBy: user.uid,
  }
  await getAdminFirestore().collection('settings').doc(body.key).set(settingData)

  return NextResponse.json({ key: body.key }, { status: 200 })
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('admin.settings.manage')
    return await upsert(user, request)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCapability('admin.settings.manage')
    return await upsert(user, request)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
