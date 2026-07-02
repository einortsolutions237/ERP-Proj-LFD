import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { Sale } from '@/lib/types/sale'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('pos.sale.void')
    const body = await request.json()

    if (!isNonEmptyString(body.reason)) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 })
    }
    const reason = body.reason.trim()

    const db = getAdminFirestore()
    const saleRef = db.collection('sales').doc(id)

    let result: { sale: Sale; reversalMovements: { productId: string; branchId: string; quantityDelta: number }[] }

    try {
      result = await db.runTransaction(async (tx) => {
        // ---- READS (must all happen before any writes) ----
        const saleSnap = await tx.get(saleRef)
        const originalMovementsSnap = await tx.get(
          db.collection('stockMovements').where('saleId', '==', id).where('type', '==', 'sale')
        )

        if (!saleSnap.exists) {
          throw new AuthError('Sale not found', 404)
        }
        const sale = saleSnap.data() as Sale

        if (sale.voidedAt) {
          throw new AuthError('Sale has already been voided', 409)
        }

        if (user.role === 'branch_manager' && sale.branchId !== user.branchId) {
          throw new AuthError('Can only void sales for your own branch', 403)
        }

        // ---- WRITES ----
        tx.update(saleRef, {
          voidedAt: new Date(),
          voidedBy: user.uid,
          voidReason: reason,
        })

        const reversalMovements: { productId: string; branchId: string; quantityDelta: number }[] = []
        for (const movementDoc of originalMovementsSnap.docs) {
          const movement = movementDoc.data()
          const productId = movement.productId as string
          const branchId = movement.branchId as string
          const restoreQuantity = -(movement.quantityDelta as number) // original delta is negative; negate to restore

          const stockRef = db.collection('productStock').doc(`${branchId}_${productId}`)
          tx.set(
            stockRef,
            { branchId, productId, quantity: FieldValue.increment(restoreQuantity), updatedAt: new Date() },
            { merge: true }
          )

          const voidMovementRef = db.collection('stockMovements').doc()
          tx.set(voidMovementRef, {
            productId,
            branchId,
            type: 'void',
            quantityDelta: restoreQuantity,
            reason: null,
            actorUid: user.uid,
            createdAt: new Date(),
            transferId: null,
            saleId: id,
          })

          reversalMovements.push({ productId, branchId, quantityDelta: restoreQuantity })
        }

        return { sale, reversalMovements }
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'sale_void',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: id,
      branchId: result.sale.branchId,
      details: {
        originalTotal: result.sale.total,
        originalLineItems: result.sale.lineItems,
        reason,
        reversalMovements: result.reversalMovements,
      },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
