import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Fields a caller is ever allowed to change via this endpoint. createdAt and
// registeredBranchId are immutable/derived server-side (registeredBranchId is
// set once at creation from the actor's own branchId) and must never be
// settable from the request body, no matter what the client sends.
const EDITABLE_FIELDS = ['name', 'phone', 'email', 'address', 'notes'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('crm.customer.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('customers').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    const body = await request.json()

    if ('name' in body && !isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    if ('phone' in body && !isNonEmptyString(body.phone)) {
      return NextResponse.json({ error: 'phone must be a non-empty string' }, { status: 400 })
    }
    if ('email' in body && body.email !== null && !isNonEmptyString(body.email)) {
      return NextResponse.json({ error: 'email must be a non-empty string or null' }, { status: 400 })
    }
    if ('address' in body && body.address !== null && !isNonEmptyString(body.address)) {
      return NextResponse.json({ error: 'address must be a non-empty string or null' }, { status: 400 })
    }
    if ('notes' in body && body.notes !== null && !isNonEmptyString(body.notes)) {
      return NextResponse.json({ error: 'notes must be a non-empty string or null' }, { status: 400 })
    }

    // Only re-check phone uniqueness when the request actually changes it —
    // comparing against the doc's own current phone avoids a false-positive
    // collision against itself.
    if ('phone' in body) {
      const newPhone = body.phone.trim()
      if (newPhone !== existing.phone) {
        const phoneSnap = await db.collection('customers').where('phone', '==', newPhone).limit(1).get()
        const collides = phoneSnap.docs.some((d) => d.id !== id)
        if (collides) {
          return NextResponse.json({ error: 'A customer with this phone number already exists' }, { status: 409 })
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name') {
        updates.name = body.name.trim()
      } else if (field === 'phone') {
        updates.phone = body.phone.trim()
      } else {
        updates[field] = isNonEmptyString(body[field]) ? (body[field] as string).trim() : null
      }
    }
    await docRef.update(updates)

    await writeAuditLog({ action: 'customer_edit', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('crm.customer.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('customers').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const salesSnap = await db.collection('sales').where('customerId', '==', id).limit(1).get()
    if (!salesSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a sale' }, { status: 409 })
    }

    const treatmentsSnap = await db.collection('treatments').where('customerId', '==', id).limit(1).get()
    if (!treatmentsSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a treatment record' }, { status: 409 })
    }
    const appointmentsSnap = await db.collection('appointments').where('customerId', '==', id).limit(1).get()
    if (!appointmentsSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by an appointment' }, { status: 409 })
    }
    const labOrdersSnap = await db.collection('labOrders').where('customerId', '==', id).limit(1).get()
    if (!labOrdersSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a lab order' }, { status: 409 })
    }

    await docRef.delete()

    await writeAuditLog({ action: 'customer_delete', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
