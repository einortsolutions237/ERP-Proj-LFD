import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { getLabRecords } from '@/lib/clinical/getLabRecords'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET(request: Request) {
  try {
    const user = await requireCapability('clinical.lab.view')
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    if (!isNonEmptyString(customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    const rows = await getLabRecords(customerId, user)
    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('clinical.lab.manage')
    const body = await request.json()

    if (!isNonEmptyString(body.customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.testName)) {
      return NextResponse.json({ error: 'testName is required' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const customerId = body.customerId.trim()
    const customerSnap = await db.collection('customers').doc(customerId).get()
    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
    }

    let instructions: string | null = null
    if ('instructions' in body && body.instructions !== undefined && body.instructions !== null && body.instructions !== '') {
      if (!isNonEmptyString(body.instructions)) {
        return NextResponse.json({ error: 'instructions must be a string or null' }, { status: 400 })
      }
      instructions = body.instructions.trim()
    }

    const orderData = {
      customerId,
      doctorUid: user.uid,
      branchId: user.branchId,
      testName: body.testName.trim(),
      instructions,
      status: 'ordered' as const,
      orderedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await db.collection('labOrders').add(orderData)

    await writeAuditLog({
      action: 'lab_order_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: customerId,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
