import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'

const MOVEMENT_TYPES = ['restock', 'adjustment', 'waste'] as const
type MovementType = (typeof MOVEMENT_TYPES)[number]

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isMovementType(value: unknown): value is MovementType {
  return MOVEMENT_TYPES.includes(value as MovementType)
}

function isNonZeroInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value !== 0
}

function normalizeReason(value: unknown): { ok: true; reason: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, reason: null }
  if (typeof value !== 'string') return { ok: false }
  const trimmed = value.trim()
  return { ok: true, reason: trimmed.length > 0 ? trimmed : null }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('inventory.stock.adjust')
    const body = await request.json()

    if (!isNonEmptyString(body.productId)) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.branchId)) {
      return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
    }
    if (!isMovementType(body.type)) {
      return NextResponse.json({ error: 'type must be one of restock, adjustment, waste' }, { status: 400 })
    }
    if (!isNonZeroInteger(body.quantityDelta)) {
      return NextResponse.json({ error: 'quantityDelta must be a nonzero integer' }, { status: 400 })
    }
    if (body.type === 'restock' && body.quantityDelta <= 0) {
      return NextResponse.json({ error: 'restock requires a positive quantityDelta' }, { status: 400 })
    }
    if (body.type === 'waste' && body.quantityDelta >= 0) {
      return NextResponse.json({ error: 'waste requires a negative quantityDelta' }, { status: 400 })
    }
    const reasonResult = normalizeReason(body.reason)
    if (!reasonResult.ok) {
      return NextResponse.json({ error: 'reason must be a string or null' }, { status: 400 })
    }

    const productId = body.productId.trim()
    const branchId = body.branchId.trim()
    const type = body.type as MovementType
    const quantityDelta = body.quantityDelta as number
    const reason = reasonResult.reason

    if (user.role === 'branch_manager' && branchId !== user.branchId) {
      return NextResponse.json({ error: 'Can only adjust stock for your own branch' }, { status: 403 })
    }

    const db = getAdminFirestore()
    const stockRef = db.collection('productStock').doc(`${branchId}_${productId}`)
    const movementRef = db.collection('stockMovements').doc()

    try {
      await db.runTransaction(async (tx) => {
        // Firestore requires every read in a transaction to happen before any
        // write is issued — the read below establishes the current quantity
        // so we can guard against a negative result before touching anything.
        const stockSnap = await tx.get(stockRef)
        const currentQuantity = (stockSnap.data()?.quantity as number | undefined) ?? 0
        const resultingQuantity = currentQuantity + quantityDelta
        if (resultingQuantity < 0) {
          throw new AuthError('Insufficient stock for this adjustment', 409)
        }

        tx.set(
          stockRef,
          { branchId, productId, quantity: FieldValue.increment(quantityDelta), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(movementRef, {
          productId,
          branchId,
          type,
          quantityDelta,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId: null,
        })
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'stock_adjust',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: productId,
      branchId,
      details: { type, quantityDelta, reason },
    })

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
