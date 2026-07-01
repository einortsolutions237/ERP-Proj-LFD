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

export async function GET() {
  try {
    await requireCapability('inventory.catalog.manage')
    // Unfiltered on purpose: products are an org-wide catalog collection,
    // not branch-scoped (same reasoning as branches/suppliers).
    const snap = await getAdminFirestore().collection('products').get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('inventory.catalog.manage')
    const body = await request.json()

    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.sku)) {
      return NextResponse.json({ error: 'sku is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.category)) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }
    if (!isNonNegativeNumber(body.unitCost)) {
      return NextResponse.json({ error: 'unitCost must be a non-negative number' }, { status: 400 })
    }
    if (!isNonNegativeNumber(body.price)) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 })
    }
    if (!isNonNegativeNumber(body.reorderThreshold)) {
      return NextResponse.json({ error: 'reorderThreshold must be a non-negative number' }, { status: 400 })
    }
    if ('supplierId' in body && body.supplierId !== null && !isNonEmptyString(body.supplierId)) {
      return NextResponse.json({ error: 'supplierId must be a non-empty string or null' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const sku = body.sku.trim()

    const skuSnap = await db.collection('products').where('sku', '==', sku).limit(1).get()
    if (!skuSnap.empty) {
      return NextResponse.json({ error: 'A product with this SKU already exists' }, { status: 409 })
    }

    const productData = {
      name: body.name.trim(),
      sku,
      category: body.category.trim(),
      unitCost: body.unitCost,
      price: body.price,
      supplierId: isNonEmptyString(body.supplierId) ? body.supplierId : null,
      reorderThreshold: body.reorderThreshold,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await db.collection('products').add(productData)

    await writeAuditLog({ action: 'product_create', actorUid: user.uid, actorEmail: user.email, targetUid: docRef.id, branchId: null })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
