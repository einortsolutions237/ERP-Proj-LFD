import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateContactField(source: Record<string, unknown>, field: 'phone' | 'email' | 'address'): string | null {
  if (source[field] === null) return null
  if (!isNonEmptyString(source[field])) throw new Error(`contact.${field} must be a non-empty string or null`)
  return (source[field] as string).trim()
}

// Fields a caller is ever allowed to change via this endpoint. createdAt is
// immutable/derived server-side and must never be settable from the request
// body, no matter what the client sends. Suppliers have no branchId field to
// scope against — like branches, a supplier document is org-wide.
const EDITABLE_FIELDS = ['name', 'contact', 'notes'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('inventory.suppliers.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('suppliers').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    const body = await request.json()

    if ('name' in body && !isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    if ('notes' in body && body.notes !== null && typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name') {
        updates.name = body.name.trim()
      } else if (field === 'notes') {
        updates.notes = isNonEmptyString(body.notes) ? body.notes.trim() : null
      } else if (field === 'contact') {
        if (body.contact !== null && !isPlainObject(body.contact)) {
          return NextResponse.json({ error: 'contact must be an object' }, { status: 400 })
        }
        const source = (body.contact ?? {}) as Record<string, unknown>
        const existingContact = (existing.contact ?? { phone: null, email: null, address: null }) as {
          phone: string | null
          email: string | null
          address: string | null
        }
        const newContact = { ...existingContact }
        try {
          for (const contactField of ['phone', 'email', 'address'] as const) {
            if (contactField in source) newContact[contactField] = validateContactField(source, contactField)
          }
        } catch (validationErr) {
          return NextResponse.json({ error: (validationErr as Error).message }, { status: 400 })
        }
        updates.contact = newContact
      }
    }
    await docRef.update(updates)

    await writeAuditLog({ action: 'supplier_edit', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('inventory.suppliers.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('suppliers').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // products doesn't exist yet (Task B3) — an empty-collection query just
    // returns no matches, so this guard becomes live once products does.
    const productsSnap = await db.collection('products').where('supplierId', '==', id).limit(1).get()
    if (!productsSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a supplier that is still referenced by a product' }, { status: 409 })
    }

    await docRef.delete()

    await writeAuditLog({ action: 'supplier_delete', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
