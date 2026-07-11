import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

export const onLowStock = onDocumentCreated(
  { document: 'stockMovements/{movementId}', database: 'default' },
  async (event) => {
    const movement = event.data?.data()
    if (!movement) return

    const { productId, branchId, quantityDelta, resultingQuantity } = movement as {
      productId: string
      branchId: string
      quantityDelta: number
      resultingQuantity?: number
    }

    const db = getFunctionsFirestore()

    const [productSnap, stockSnap, branchSnap] = await Promise.all([
      db.collection('products').doc(productId).get(),
      db.collection('productStock').doc(`${branchId}_${productId}`).get(),
      db.collection('branches').doc(branchId).get(),
    ])
    if (!productSnap.exists || !stockSnap.exists) return

    const reorderThreshold = productSnap.data()!.reorderThreshold as number
    // TD-2, resolved: the movement's own transaction (api/stock/movements,
    // api/stock/transfer, api/sales) now snapshots the actual post-movement
    // quantity onto the movement doc itself as `resultingQuantity`, read
    // directly here — no reconstruction, no race window, for every
    // movement written after this phase shipped. `resultingQuantity` is
    // only absent for a movement that predates this phase, or for a `void`
    // reversal (api/sales/[id]/void/route.ts, deliberately not touched —
    // its quantityDelta is always positive, so it can never trip the
    // crossing check below regardless of precision). For those cases only,
    // fall back to the original reconstruction, which carries the
    // documented race-window limitation but is provably irrelevant for
    // void's always-positive delta and immaterial for aged historical data.
    const quantityAfter =
      typeof resultingQuantity === 'number' ? resultingQuantity : (stockSnap.data()!.quantity as number)
    const quantityBefore = quantityAfter - quantityDelta

    const newlyCrossed = quantityAfter <= reorderThreshold && quantityBefore > reorderThreshold
    if (!newlyCrossed) return

    const productName = productSnap.data()!.name as string
    const branchName = branchSnap.exists ? (branchSnap.data()!.name as string) : branchId

    const [branchManagersSnap, orgAdminsSnap] = await Promise.all([
      db.collection('staff').where('role', '==', 'branch_manager').where('branchId', '==', branchId).get(),
      db.collection('staff').where('role', 'in', ['admin', 'super_admin']).get(),
    ])
    const recipientUids = new Set<string>([
      ...branchManagersSnap.docs.map((d) => d.id),
      ...orgAdminsSnap.docs.map((d) => d.id),
    ])
    // Empty recipient set (e.g. a branch with no assigned branch_manager,
    // in a system that otherwise also somehow has no admin/super_admin —
    // shouldn't happen in practice, but this trigger must not error or
    // commit a no-op batch if it does) — nothing to notify, done.
    if (recipientUids.size === 0) return

    const movementId = event.params.movementId
    const batch = db.batch()
    for (const recipientUid of recipientUids) {
      const notifRef = db.collection('notifications').doc(`low_stock_${movementId}_${recipientUid}`)
      batch.create(notifRef, {
        recipientUid,
        type: 'low_stock',
        title: `Low stock: ${productName}`,
        body: `${productName} at ${branchName} is at ${quantityAfter} units (reorder threshold ${reorderThreshold}).`,
        relatedId: productId,
        read: false,
        createdAt: new Date(),
      })
    }
    try {
      await batch.commit()
    } catch (err) {
      // A retry of this exact event: every create() in the batch fails
      // together (batches are atomic) because every doc already exists
      // from the first delivery. Harmless — swallow it. Anything else
      // (a real failure) still propagates.
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
