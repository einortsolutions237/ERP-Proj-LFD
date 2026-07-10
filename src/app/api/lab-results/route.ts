import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { LabResultFlag } from '@/lib/types/labResult'

const FLAGS: LabResultFlag[] = ['normal', 'low', 'high']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

interface RawValue {
  parameter?: unknown
  value?: unknown
  unit?: unknown
  referenceRange?: unknown
  flag?: unknown
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('clinical.lab.results.enter')
    const body = await request.json()

    if (!isNonEmptyString(body.labOrderId)) {
      return NextResponse.json({ error: 'labOrderId is required' }, { status: 400 })
    }
    if (!Array.isArray(body.values) || body.values.length === 0) {
      return NextResponse.json({ error: 'values must be a non-empty array' }, { status: 400 })
    }

    const rawValues = body.values as RawValue[]
    for (const v of rawValues) {
      if (!isNonEmptyString(v.parameter)) {
        return NextResponse.json({ error: 'each value requires a parameter' }, { status: 400 })
      }
      if (!isNonEmptyString(v.value)) {
        return NextResponse.json({ error: 'each value requires a value' }, { status: 400 })
      }
      if (v.unit !== undefined && v.unit !== null && !isNonEmptyString(v.unit)) {
        return NextResponse.json({ error: 'unit must be a string or null' }, { status: 400 })
      }
      if (v.referenceRange !== undefined && v.referenceRange !== null && !isNonEmptyString(v.referenceRange)) {
        return NextResponse.json({ error: 'referenceRange must be a string or null' }, { status: 400 })
      }
      if (v.flag !== undefined && v.flag !== null && !FLAGS.includes(v.flag as LabResultFlag)) {
        return NextResponse.json({ error: 'flag must be normal, low, high, or null' }, { status: 400 })
      }
    }

    let notes: string | null = null
    if ('notes' in body && body.notes !== undefined && body.notes !== null && body.notes !== '') {
      if (!isNonEmptyString(body.notes)) {
        return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 })
      }
      notes = body.notes.trim()
    }

    const values = rawValues.map((v) => ({
      parameter: (v.parameter as string).trim(),
      value: (v.value as string).trim(),
      unit: isNonEmptyString(v.unit) ? (v.unit as string).trim() : null,
      referenceRange: isNonEmptyString(v.referenceRange) ? (v.referenceRange as string).trim() : null,
      flag: (v.flag as LabResultFlag | null | undefined) ?? null,
    }))

    const db = getAdminFirestore()
    const labOrderId = body.labOrderId.trim()
    const orderRef = db.collection('labOrders').doc(labOrderId)
    const resultRef = db.collection('labResults').doc()

    let orderMeta: { customerId: string; branchId: string }
    try {
      orderMeta = await db.runTransaction(async (tx) => {
        const orderSnap = await tx.get(orderRef)
        if (!orderSnap.exists) {
          throw new AuthError('labOrderId does not reference an existing lab order', 400)
        }
        const order = orderSnap.data()!
        if (order.status !== 'ordered') {
          throw new AuthError('Results have already been entered for this order', 409)
        }
        tx.set(resultRef, {
          labOrderId,
          values,
          notes,
          enteredBy: user.uid,
          enteredAt: new Date(),
        })
        tx.update(orderRef, { status: 'completed', updatedAt: new Date() })
        return { customerId: order.customerId as string, branchId: order.branchId as string }
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'lab_result_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: orderMeta.customerId,
      branchId: orderMeta.branchId,
      details: null,
    })

    return NextResponse.json({ id: resultRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
