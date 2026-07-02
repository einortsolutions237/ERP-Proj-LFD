import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

export const onLowStock = onDocumentCreated(
  { document: 'stockMovements/{movementId}', database: 'default' },
  async (event) => {
    const movement = event.data?.data()
    if (!movement) return

    const { productId, branchId, quantityDelta } = movement as {
      productId: string
      branchId: string
      quantityDelta: number
    }

    const db = getFunctionsFirestore()

    const [productSnap, stockSnap, branchSnap] = await Promise.all([
      db.collection('products').doc(productId).get(),
      db.collection('productStock').doc(`${branchId}_${productId}`).get(),
      db.collection('branches').doc(branchId).get(),
    ])
    if (!productSnap.exists || !stockSnap.exists) return

    const reorderThreshold = productSnap.data()!.reorderThreshold as number
    const quantityAfter = stockSnap.data()!.quantity as number
    // The movement's own transaction already incremented productStock by
    // the time this trigger fires (same atomic write), so subtracting this
    // movement's own delta reconstructs the pre-movement quantity. Known,
    // documented limitation (tracked as TD-2 in docs/tech-debt.md): if a
    // second movement for the same product+branch lands between that
    // transaction committing and this handler's read, quantityAfter
    // reflects BOTH movements, not just this one — the "before" value
    // would be off. Accepted for this phase's traffic level; there is no
    // other way to reconstruct it without storing a quantity snapshot on
    // stockMovements itself, which would mean touching the already-audited
    // write path this phase must not touch.
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
