import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

export const onLabResultEntered = onDocumentCreated(
  { document: 'labResults/{labResultId}', database: 'default' },
  async (event) => {
    const result = event.data?.data()
    if (!result) return

    const { labOrderId } = result as { labOrderId: string }

    const db = getFunctionsFirestore()
    const orderSnap = await db.collection('labOrders').doc(labOrderId).get()
    if (!orderSnap.exists) return
    const order = orderSnap.data()!
    const doctorUid = order.doctorUid as string
    const customerId = order.customerId as string
    const testName = order.testName as string

    const customerSnap = await db.collection('customers').doc(customerId).get()
    const customerName = customerSnap.exists ? (customerSnap.data()!.name as string) : customerId

    const labResultId = event.params.labResultId
    const notifRef = db.collection('notifications').doc(`lab_result_entered_${labResultId}`)
    try {
      await notifRef.create({
        recipientUid: doctorUid,
        type: 'lab_result_entered',
        title: 'Lab result entered',
        body: `${testName} for ${customerName}.`,
        relatedId: customerId,
        read: false,
        createdAt: new Date(),
      })
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
