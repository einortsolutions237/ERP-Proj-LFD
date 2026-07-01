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

// Fields a caller is ever allowed to change via this endpoint. createdAt is
// immutable/derived server-side and must never be settable from the request
// body, no matter what the client sends. Products have no branchId field to
// scope against — like branches/suppliers, a product document is org-wide.
const EDITABLE_FIELDS = ['name', 'sku', 'category', 'unitCost', 'price', 'supplierId', 'reorderThreshold', 'active'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('inventory.catalog.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('products').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    const body = await request.json()

    if ('name' in body && !isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    if ('sku' in body && !isNonEmptyString(body.sku)) {
      return NextResponse.json({ error: 'sku must be a non-empty string' }, { status: 400 })
    }
    if ('category' in body && !isNonEmptyString(body.category)) {
      return NextResponse.json({ error: 'category must be a non-empty string' }, { status: 400 })
    }
    if ('unitCost' in body && !isNonNegativeNumber(body.unitCost)) {
      return NextResponse.json({ error: 'unitCost must be a non-negative number' }, { status: 400 })
    }
    if ('price' in body && !isNonNegativeNumber(body.price)) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 })
    }
    if ('reorderThreshold' in body && !isNonNegativeNumber(body.reorderThreshold)) {
      return NextResponse.json({ error: 'reorderThreshold must be a non-negative number' }, { status: 400 })
    }
    if ('supplierId' in body && body.supplierId !== null && !isNonEmptyString(body.supplierId)) {
      return NextResponse.json({ error: 'supplierId must be a non-empty string or null' }, { status: 400 })
    }
    if ('active' in body && typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'active must be a boolean' }, { status: 400 })
    }

    // Only re-check SKU uniqueness when the request actually changes it —
    // comparing against the doc's own current SKU avoids a false-positive
    // collision against itself.
    if ('sku' in body) {
      const newSku = body.sku.trim()
      if (newSku !== existing.sku) {
        const skuSnap = await db.collection('products').where('sku', '==', newSku).limit(1).get()
        const collides = skuSnap.docs.some((d) => d.id !== id)
        if (collides) {
          return NextResponse.json({ error: 'A product with this SKU already exists' }, { status: 409 })
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name' || field === 'category') {
        updates[field] = body[field].trim()
      } else if (field === 'sku') {
        updates.sku = body.sku.trim()
      } else if (field === 'supplierId') {
        updates.supplierId = isNonEmptyString(body.supplierId) ? body.supplierId : null
      } else {
        updates[field] = body[field]
      }
    }
    await docRef.update(updates)

    await writeAuditLog({ action: 'product_edit', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

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
    const docRef = db.collection('products').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // productStock doesn't exist yet (Task B5) — an empty-collection query
    // just returns no matches, so this guard becomes live once stock records do.
    const stockSnap = await db.collection('productStock').where('productId', '==', id).limit(1).get()
    if (!stockSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a product that has stock records' }, { status: 409 })
    }

    await docRef.delete()

    await writeAuditLog({ action: 'product_delete', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
