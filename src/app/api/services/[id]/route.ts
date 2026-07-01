import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 1
}

// Fields a caller is ever allowed to change via this endpoint. createdAt is
// immutable/derived server-side and must never be settable from the request
// body, no matter what the client sends. Services have no branchId field to
// scope against — like products/suppliers/branches, a service document is org-wide.
const EDITABLE_FIELDS = ['name', 'category', 'price', 'durationMinutes', 'description', 'active'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('inventory.catalog.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('services').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json()

    if ('name' in body && !isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    if ('category' in body && !isNonEmptyString(body.category)) {
      return NextResponse.json({ error: 'category must be a non-empty string' }, { status: 400 })
    }
    if ('price' in body && !isNonNegativeNumber(body.price)) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 })
    }
    if ('durationMinutes' in body && !isPositiveInteger(body.durationMinutes)) {
      return NextResponse.json({ error: 'durationMinutes must be an integer of at least 1' }, { status: 400 })
    }
    if ('description' in body && body.description !== null && typeof body.description !== 'string') {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 })
    }
    if ('active' in body && typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name' || field === 'category') {
        updates[field] = body[field].trim()
      } else if (field === 'description') {
        updates.description = isNonEmptyString(body.description) ? body.description.trim() : null
      } else {
        updates[field] = body[field]
      }
    }
    await docRef.update(updates)

    await writeAuditLog({ action: 'service_edit', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('inventory.catalog.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('services').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await docRef.delete()

    await writeAuditLog({ action: 'service_delete', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
