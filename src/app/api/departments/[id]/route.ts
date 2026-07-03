import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Fields a caller is ever allowed to change via this endpoint. branchId and
// createdAt are immutable/derived server-side and must never be settable
// from the request body, no matter what the client sends.
const EDITABLE_FIELDS = ['name', 'active'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('admin.departments.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('departments').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    // Only a branch-locked role (e.g. branch_manager) is restricted to its own
    // branch's departments — that restriction doubles as "don't reveal that a
    // department exists in another branch" via the same 404 as a genuinely
    // missing doc. A non-branch-locked role (e.g. admin/super_admin) is
    // org-wide and may act on any branch's department doc.
    if (isBranchLocked(user.role) && existing.branchId !== user.branchId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()

    if ('name' in body && !isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    if ('active' in body && typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (field in body) updates[field] = field === 'name' ? body.name.trim() : body[field]
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
    const user = await requireCapability('admin.departments.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('departments').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    // Only a branch-locked role (e.g. branch_manager) is restricted to its own
    // branch's departments — that restriction doubles as "don't reveal that a
    // department exists in another branch" via the same 404 as a genuinely
    // missing doc. A non-branch-locked role (e.g. admin/super_admin) is
    // org-wide and may act on any branch's department doc.
    if (isBranchLocked(user.role) && existing.branchId !== user.branchId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await docRef.delete()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
