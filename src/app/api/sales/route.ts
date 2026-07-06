import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { normalizeCartLines, type RawCartLine } from '@/lib/pos/normalize-cart'
import type { SaleLineItem } from '@/lib/types/sale'

const PAYMENT_METHODS = ['cash', 'mtn_momo', 'orange_money'] as const
type PaymentMethod = (typeof PAYMENT_METHODS)[number]

const EPSILON = 0.01

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0
}
function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod)
}

export async function GET() {
  try {
    const user = await requireCapability('pos.sale.view')
    const snap = await getAdminFirestore().collection('sales').where('branchId', '==', user.branchId).get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('pos.sale.create')
    const body = await request.json()

    if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
      return NextResponse.json({ error: 'lineItems must be a non-empty array' }, { status: 400 })
    }
    const rawLines: RawCartLine[] = []
    for (const line of body.lineItems) {
      if (line?.type !== 'product' && line?.type !== 'service') {
        return NextResponse.json({ error: 'each line item must have type "product" or "service"' }, { status: 400 })
      }
      if (!isNonEmptyString(line.itemId)) {
        return NextResponse.json({ error: 'each line item must have a non-empty itemId' }, { status: 400 })
      }
      if (!isPositiveInteger(line.quantity)) {
        return NextResponse.json({ error: 'each line item must have a positive integer quantity' }, { status: 400 })
      }
      rawLines.push({ type: line.type, itemId: line.itemId.trim(), quantity: line.quantity })
    }

    const discountAmount =
      'discountAmount' in body && body.discountAmount !== undefined && body.discountAmount !== null
        ? body.discountAmount
        : 0
    if (!isNonNegativeNumber(discountAmount)) {
      return NextResponse.json({ error: 'discountAmount must be a non-negative number' }, { status: 400 })
    }

    if (!Array.isArray(body.payments) || body.payments.length === 0) {
      return NextResponse.json({ error: 'payments must be a non-empty array' }, { status: 400 })
    }
    const payments: { method: PaymentMethod; amount: number; reference: string | null }[] = []
    for (const p of body.payments) {
      if (!isPaymentMethod(p?.method)) {
        return NextResponse.json({ error: 'each payment must have method cash, mtn_momo, or orange_money' }, { status: 400 })
      }
      if (!isNonNegativeNumber(p.amount) || p.amount <= 0) {
        return NextResponse.json({ error: 'each payment amount must be a positive number' }, { status: 400 })
      }
      let reference: string | null = null
      if ('reference' in p && p.reference !== null && p.reference !== undefined) {
        if (typeof p.reference !== 'string') {
          return NextResponse.json({ error: 'payment reference must be a string or null' }, { status: 400 })
        }
        const trimmed = p.reference.trim()
        reference = trimmed.length > 0 ? trimmed : null
      }
      payments.push({ method: p.method, amount: p.amount, reference })
    }

    let customerId: string | null = null
    if ('customerId' in body && body.customerId !== undefined && body.customerId !== null) {
      if (!isNonEmptyString(body.customerId)) {
        return NextResponse.json({ error: 'customerId must be a non-empty string or null' }, { status: 400 })
      }
      customerId = body.customerId.trim()
    }

    let clientIdempotencyKey: string | null = null
    if ('clientIdempotencyKey' in body && body.clientIdempotencyKey !== undefined && body.clientIdempotencyKey !== null) {
      if (!isNonEmptyString(body.clientIdempotencyKey)) {
        return NextResponse.json({ error: 'clientIdempotencyKey must be a non-empty string or null' }, { status: 400 })
      }
      clientIdempotencyKey = body.clientIdempotencyKey.trim()
    }

    const db = getAdminFirestore()
    const saleRef = db.collection('sales').doc()
    const normalized = normalizeCartLines(rawLines)
    const movementRefs = new Map(normalized.productLines.map((pl) => [pl.itemId, db.collection('stockMovements').doc()]))

    let committed:
      | { existing: true; id: string; subtotal: number; total: number }
      | {
          existing: false
          resolvedLineItems: SaleLineItem[]
          subtotal: number
          total: number
          backorders: { itemId: string; name: string; quantityTaken: number; quantityOwed: number }[]
        }

    try {
      committed = await db.runTransaction(async (tx) => {
        // ---- READS (all must happen before any writes) ----
        // Idempotency check first, before any other read — a replayed
        // request (the offline sync queue retrying after a lost response)
        // must short-circuit here rather than re-resolving prices/stock/
        // backorders a second time. tx.get() on a Query (not just a
        // DocumentReference) is already an established pattern in this
        // codebase — see api/sales/[id]/void/route.ts's stockMovements
        // lookup.
        if (clientIdempotencyKey) {
          const existingSnap = await tx.get(
            db.collection('sales').where('clientIdempotencyKey', '==', clientIdempotencyKey).limit(1)
          )
          if (!existingSnap.empty) {
            const existing = existingSnap.docs[0]
            const data = existing.data()
            return { existing: true, id: existing.id, subtotal: data.subtotal as number, total: data.total as number }
          }
        }

        const distinctItemIds = Array.from(new Set(rawLines.map((l) => l.itemId)))
        const itemRefs = new Map(
          rawLines.map((l) => [l.itemId, db.collection(l.type === 'product' ? 'products' : 'services').doc(l.itemId)] as const)
        )
        const itemSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>()
        for (const itemId of distinctItemIds) {
          itemSnaps.set(itemId, await tx.get(itemRefs.get(itemId)!))
        }

        for (const line of rawLines) {
          const snap = itemSnaps.get(line.itemId)!
          if (!snap.exists) {
            throw new AuthError(`Item ${line.itemId} does not exist`, 400)
          }
          if (snap.data()!.active !== true) {
            throw new AuthError(`Item "${snap.data()!.name}" is not available for sale`, 400)
          }
        }

        if (customerId) {
          const customerSnap = await tx.get(db.collection('customers').doc(customerId))
          if (!customerSnap.exists) {
            throw new AuthError('customerId does not reference an existing customer', 400)
          }
        }

        const resolvedLineItems: SaleLineItem[] = rawLines.map((line) => {
          const data = itemSnaps.get(line.itemId)!.data()!
          const unitPrice = data.price as number
          const lineTotal = unitPrice * line.quantity
          return { type: line.type, itemId: line.itemId, name: data.name as string, unitPrice, quantity: line.quantity, lineTotal }
        })
        const subtotal = resolvedLineItems.reduce((sum, l) => sum + l.lineTotal, 0)

        if (discountAmount > subtotal) {
          throw new AuthError('discountAmount cannot exceed subtotal', 400)
        }
        const taxAmount = 0
        const total = subtotal - discountAmount + taxAmount

        const paymentsSum = payments.reduce((sum, p) => sum + p.amount, 0)
        if (Math.abs(paymentsSum - total) >= EPSILON) {
          throw new AuthError('Payments must sum to the sale total', 400)
        }

        const stockRefs = new Map(
          normalized.productLines.map((pl) => [pl.itemId, db.collection('productStock').doc(`${user.branchId}_${pl.itemId}`)] as const)
        )
        const stockSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>()
        for (const pl of normalized.productLines) {
          stockSnaps.set(pl.itemId, await tx.get(stockRefs.get(pl.itemId)!))
        }

        const quantityTakenMap = new Map<string, number>()
        const backorders: { itemId: string; name: string; quantityTaken: number; quantityOwed: number }[] = []
        for (const pl of normalized.productLines) {
          const currentQuantity = (stockSnaps.get(pl.itemId)!.data()?.quantity as number | undefined) ?? 0
          const quantityTaken = Math.min(currentQuantity, pl.quantity)
          quantityTakenMap.set(pl.itemId, quantityTaken)
          const quantityOwed = pl.quantity - quantityTaken
          if (quantityOwed > 0) {
            const name = itemSnaps.get(pl.itemId)!.data()!.name as string
            backorders.push({ itemId: pl.itemId, name, quantityTaken, quantityOwed })
          }
        }

        if (backorders.length > 0 && !customerId) {
          throw new AuthError('A sale with a backordered item must have a customer attached', 409)
        }

        // ---- WRITES ----
        tx.set(saleRef, {
          branchId: user.branchId,
          lineItems: resolvedLineItems,
          subtotal,
          discountAmount,
          taxAmount,
          total,
          payments,
          cashierUid: user.uid,
          customerId,
          clientIdempotencyKey,
          voidedAt: null,
          voidedBy: null,
          voidReason: null,
          createdAt: new Date(),
        })

        for (const pl of normalized.productLines) {
          const quantityTaken = quantityTakenMap.get(pl.itemId)!
          tx.set(
            stockRefs.get(pl.itemId)!,
            { branchId: user.branchId, productId: pl.itemId, quantity: FieldValue.increment(-quantityTaken), updatedAt: new Date() },
            { merge: true }
          )
          tx.set(movementRefs.get(pl.itemId)!, {
            productId: pl.itemId,
            branchId: user.branchId,
            type: 'sale',
            quantityDelta: -quantityTaken,
            reason: null,
            actorUid: user.uid,
            createdAt: new Date(),
            transferId: null,
            saleId: saleRef.id,
          })
        }

        const pendingDeliveryRefs = new Map(backorders.map((b) => [b.itemId, db.collection('pendingDeliveries').doc()] as const))
        for (const b of backorders) {
          tx.set(pendingDeliveryRefs.get(b.itemId)!, {
            saleId: saleRef.id,
            productId: b.itemId,
            customerId: customerId as string,
            branchId: user.branchId,
            quantityOwed: b.quantityOwed,
            status: 'pending',
            fulfilledBy: null,
            fulfilledAt: null,
            createdAt: new Date(),
          })
        }

        return { existing: false, resolvedLineItems, subtotal, total, backorders }
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    if (committed.existing) {
      // Replayed request (matched an already-processed clientIdempotencyKey)
      // — the original request already wrote the sale_create audit entry;
      // writing a second one here would misrepresent a replay as a new sale.
      return NextResponse.json({ id: committed.id, subtotal: committed.subtotal, total: committed.total }, { status: 200 })
    }

    await writeAuditLog({
      action: 'sale_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: saleRef.id,
      branchId: user.branchId,
      details: {
        lineItems: committed.resolvedLineItems,
        subtotal: committed.subtotal,
        discountAmount,
        taxAmount: 0,
        total: committed.total,
        payments,
        customerId,
        backorders: committed.backorders,
      },
    })

    return NextResponse.json({ id: saleRef.id, subtotal: committed.subtotal, total: committed.total }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
