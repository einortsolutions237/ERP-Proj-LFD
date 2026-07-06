import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import { writeAuditLog } from '@/lib/audit/log'
import type { PendingDelivery } from '@/lib/types/pendingDelivery'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('pos.delivery.fulfill')

    const db = getAdminFirestore()
    const deliveryRef = db.collection('pendingDeliveries').doc(id)

    let delivery: PendingDelivery

    try {
      delivery = await db.runTransaction(async (tx) => {
        const snap = await tx.get(deliveryRef)
        if (!snap.exists) {
          throw new AuthError('Pending delivery not found', 404)
        }
        const data = snap.data() as PendingDelivery

        if (isBranchLocked(user.role) && data.branchId !== user.branchId) {
          throw new AuthError('Can only fulfill pending deliveries for your own branch', 403)
        }
        if (data.status === 'fulfilled') {
          throw new AuthError('This delivery has already been fulfilled', 409)
        }

        tx.update(deliveryRef, {
          status: 'fulfilled',
          fulfilledBy: user.uid,
          fulfilledAt: new Date(),
        })

        return { ...data, id: snap.id }
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'pending_delivery_fulfilled',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: delivery.customerId,
      branchId: delivery.branchId,
      details: { saleId: delivery.saleId, productId: delivery.productId, quantityOwed: delivery.quantityOwed },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
