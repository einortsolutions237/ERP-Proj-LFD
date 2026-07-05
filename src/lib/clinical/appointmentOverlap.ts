import type { Firestore, Transaction } from 'firebase-admin/firestore'

// Only 'scheduled' appointments can conflict — a cancelled/completed/no_show
// appointment no longer occupies the doctor's time. Called inside a
// transaction by both POST /api/appointments (create) and PATCH
// /api/appointments/[id] (reschedule) so the read-check-write is atomic
// with the write that follows it, the same discipline as every stock
// transaction in this app. excludeAppointmentId lets a reschedule ignore
// the appointment's own prior slot when checking for conflicts.
export async function findOverlappingAppointment(
  tx: Transaction,
  db: Firestore,
  doctorUid: string,
  start: Date,
  end: Date,
  excludeAppointmentId?: string
): Promise<string | null> {
  const query = db.collection('appointments').where('doctorUid', '==', doctorUid).where('status', '==', 'scheduled')
  const snap = await tx.get(query)
  for (const doc of snap.docs) {
    if (doc.id === excludeAppointmentId) continue
    const data = doc.data()
    const existingStart = (data.scheduledAt as FirebaseFirestore.Timestamp).toDate()
    const existingEnd = new Date(existingStart.getTime() + (data.durationMinutes as number) * 60_000)
    if (start < existingEnd && existingStart < end) return doc.id
  }
  return null
}
