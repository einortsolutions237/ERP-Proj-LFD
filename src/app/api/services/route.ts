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

export async function GET() {
  try {
    await requireCapability('inventory.catalog.manage')
    // Unfiltered on purpose: services are an org-wide catalog collection,
    // not branch-scoped (same reasoning as products/suppliers/branches).
    const snap = await getAdminFirestore().collection('services').get()
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
    if (!isNonEmptyString(body.category)) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }
    if (!isNonNegativeNumber(body.price)) {
      return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 })
    }
    if (!isPositiveInteger(body.durationMinutes)) {
      return NextResponse.json({ error: 'durationMinutes must be an integer of at least 1' }, { status: 400 })
    }
    if ('description' in body && body.description !== null && typeof body.description !== 'string') {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 })
    }

    const db = getAdminFirestore()

    const trimmedDescription = isNonEmptyString(body.description) ? body.description.trim() : null

    const serviceData = {
      name: body.name.trim(),
      category: body.category.trim(),
      price: body.price,
      durationMinutes: body.durationMinutes,
      description: trimmedDescription,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await db.collection('services').add(serviceData)

    await writeAuditLog({ action: 'service_create', actorUid: user.uid, actorEmail: user.email, targetUid: docRef.id, branchId: null })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
