import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

export const onPendingDeliveryCreated = onDocumentCreated(
  { document: 'pendingDeliveries/{deliveryId}', database: 'default' },
  async (event) => {
    const delivery = event.data?.data()
    if (!delivery) return

    const { productId, branchId, customerId, quantityOwed } = delivery as {
      productId: string
      branchId: string
      customerId: string
      quantityOwed: number
    }

    const db = getFunctionsFirestore()
    const [productSnap, customerSnap, branchManagersSnap] = await Promise.all([
      db.collection('products').doc(productId).get(),
      db.collection('customers').doc(customerId).get(),
      db.collection('staff').where('role', '==', 'branch_manager').where('branchId', '==', branchId).get(),
    ])
    // No branch_manager assigned to this branch — nothing to notify.
    // Doesn't error or commit a no-op batch, same handling as onLowStock.
    if (branchManagersSnap.empty) return

    const productName = productSnap.exists ? (productSnap.data()!.name as string) : productId
    const customerName = customerSnap.exists ? (customerSnap.data()!.name as string) : customerId
    const deliveryId = event.params.deliveryId

    const batch = db.batch()
    for (const managerDoc of branchManagersSnap.docs) {
      const notifRef = db.collection('notifications').doc(`pending_delivery_${deliveryId}_${managerDoc.id}`)
      batch.create(notifRef, {
        recipientUid: managerDoc.id,
        type: 'pending_delivery',
        title: 'New pending delivery',
        body: `${quantityOwed} unit(s) of ${productName} owed to ${customerName}.`,
        relatedId: customerId,
        read: false,
        createdAt: new Date(),
      })
    }
    try {
      await batch.commit()
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
