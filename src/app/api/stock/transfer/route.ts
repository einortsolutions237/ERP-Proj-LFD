import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0
}

function normalizeReason(value: unknown): { ok: true; reason: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, reason: null }
  if (typeof value !== 'string') return { ok: false }
  const trimmed = value.trim()
  return { ok: true, reason: trimmed.length > 0 ? trimmed : null }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('inventory.stock.transfer')
    const body = await request.json()

    if (!isNonEmptyString(body.productId)) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.sourceBranchId)) {
      return NextResponse.json({ error: 'sourceBranchId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.destBranchId)) {
      return NextResponse.json({ error: 'destBranchId is required' }, { status: 400 })
    }
    if (body.sourceBranchId === body.destBranchId) {
      return NextResponse.json({ error: 'Source and destination branch must differ' }, { status: 400 })
    }
    if (!isPositiveInteger(body.quantity)) {
      return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 })
    }
    const reasonResult = normalizeReason(body.reason)
    if (!reasonResult.ok) {
      return NextResponse.json({ error: 'reason must be a string or null' }, { status: 400 })
    }

    const productId = body.productId.trim()
    const sourceBranchId = body.sourceBranchId.trim()
    const destBranchId = body.destBranchId.trim()
    const quantity = body.quantity as number
    const reason = reasonResult.reason

    if (user.role === 'branch_manager' && sourceBranchId !== user.branchId) {
      return NextResponse.json({ error: 'Can only transfer stock out of your own branch' }, { status: 403 })
    }

    const transferId = randomUUID()

    const db = getAdminFirestore()
    const sourceStockRef = db.collection('productStock').doc(`${sourceBranchId}_${productId}`)
    const destStockRef = db.collection('productStock').doc(`${destBranchId}_${productId}`)
    const outMovementRef = db.collection('stockMovements').doc()
    const inMovementRef = db.collection('stockMovements').doc()

    try {
      await db.runTransaction(async (tx) => {
        // Firestore requires every read in a transaction to happen before any
        // write is issued — both productStock docs are read here first, then
        // all four writes (two stock updates, two movement creates) happen
        // together below.
        const sourceSnap = await tx.get(sourceStockRef)
        await tx.get(destStockRef)

        const sourceQuantity = (sourceSnap.data()?.quantity as number | undefined) ?? 0
        const resultingSourceQuantity = sourceQuantity - quantity
        if (resultingSourceQuantity < 0) {
          throw new AuthError('Insufficient stock at source branch for this transfer', 409)
        }

        tx.set(
          sourceStockRef,
          { branchId: sourceBranchId, productId, quantity: FieldValue.increment(-quantity), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(
          destStockRef,
          { branchId: destBranchId, productId, quantity: FieldValue.increment(quantity), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(outMovementRef, {
          productId,
          branchId: sourceBranchId,
          type: 'transfer_out',
          quantityDelta: -quantity,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId,
        })
        tx.set(inMovementRef, {
          productId,
          branchId: destBranchId,
          type: 'transfer_in',
          quantityDelta: quantity,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId,
        })
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'stock_transfer',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: productId,
      branchId: sourceBranchId,
      details: { destBranchId, quantity, reason, transferId },
    })

    return NextResponse.json({ ok: true, transferId }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
