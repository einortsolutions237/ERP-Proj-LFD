import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

function formatDateTime(ts: FirebaseFirestore.Timestamp): string {
  return ts.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

export const onAppointmentScheduled = onDocumentCreated(
  { document: 'appointments/{appointmentId}', database: 'default' },
  async (event) => {
    const appointment = event.data?.data()
    if (!appointment) return

    const { doctorUid, customerId, scheduledAt } = appointment as {
      doctorUid: string
      customerId: string
      scheduledAt: FirebaseFirestore.Timestamp
    }

    const db = getFunctionsFirestore()
    const customerSnap = await db.collection('customers').doc(customerId).get()
    const customerName = customerSnap.exists ? (customerSnap.data()!.name as string) : customerId

    const appointmentId = event.params.appointmentId
    const notifRef = db.collection('notifications').doc(`appointment_scheduled_${appointmentId}`)
    try {
      await notifRef.create({
        recipientUid: doctorUid,
        type: 'appointment_scheduled',
        title: 'New appointment',
        body: `${customerName} — ${formatDateTime(scheduledAt)}.`,
        relatedId: appointmentId,
        read: false,
        createdAt: new Date(),
      })
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
