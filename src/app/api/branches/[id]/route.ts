import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Fields a caller is ever allowed to change via this endpoint. createdAt is
// immutable/derived server-side and must never be settable from the request
// body, no matter what the client sends. Note: unlike departments/staff,
// branches have no branchId field to scope against — a branch document IS
// the branch, so there is no cross-branch check here by design.
const EDITABLE_FIELDS = ['name', 'address', 'phone', 'active'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await requireCapability('admin.branches.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('branches').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json()

    if ('name' in body && !isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    if ('address' in body && !isNonEmptyString(body.address)) {
      return NextResponse.json({ error: 'address must be a non-empty string' }, { status: 400 })
    }
    if ('phone' in body && body.phone !== null && typeof body.phone !== 'string') {
      return NextResponse.json({ error: 'phone must be a string or null' }, { status: 400 })
    }
    if ('active' in body && typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name' || field === 'address') {
        updates[field] = body[field].trim()
      } else if (field === 'phone') {
        updates.phone = isNonEmptyString(body.phone) ? body.phone.trim() : null
      } else {
        updates[field] = body[field]
      }
    }
    await docRef.update(updates)

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await requireCapability('admin.branches.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('branches').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [staffSnap, departmentsSnap] = await Promise.all([
      db.collection('staff').where('branchId', '==', id).limit(1).get(),
      db.collection('departments').where('branchId', '==', id).limit(1).get(),
    ])
    if (!staffSnap.empty || !departmentsSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a branch that still has staff or departments assigned to it' }, { status: 409 })
    }

    await docRef.delete()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
