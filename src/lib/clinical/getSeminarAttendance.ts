import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Seminar } from '@/lib/types/seminar'
import type { SeminarAttendance, AttendanceMethod } from '@/lib/types/seminarAttendance'

export interface SeminarAttendanceRow {
  id: string
  seminarId: string
  seminarTitle: string
  seminarScheduledAt: string
  customerId: string
  customerName: string
  method: AttendanceMethod
  recordedBy: string
  recordedByName: string
  recordedAt: string
}

export interface SeminarAttendanceFilters {
  seminarId?: string
  customerId?: string
}

// Called by GET /api/seminar-attendance, the seminar detail page's attendee
// list (Task 5), and the customer detail page's "Seminar attendance"
// subsection (Task 6) — same single-call-site-for-audit-logging discipline
// as getPatientTreatments/getAppointments/getLabRecords, so "viewing
// attendance is read-audit-logged" is true by construction. Re-checks the
// capability itself rather than trusting the caller already did, same
// belt-and-suspenders discipline as its three clinical precedents.
export async function getSeminarAttendance(
  filters: SeminarAttendanceFilters,
  viewer: SessionUser
): Promise<SeminarAttendanceRow[]> {
  if (!hasCapability(viewer.role, 'seminars.attendance.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('seminarAttendance')
  if (filters.seminarId) query = query.where('seminarId', '==', filters.seminarId)
  if (filters.customerId) query = query.where('customerId', '==', filters.customerId)
  query = query.orderBy('recordedAt', 'desc')
  const snap = await query.get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as SeminarAttendance }))
  const uniqueSeminarIds = Array.from(new Set(docs.map((d) => d.data.seminarId)))
  const uniqueCustomerIds = Array.from(new Set(docs.map((d) => d.data.customerId)))
  const uniqueRecordedByUids = Array.from(new Set(docs.map((d) => d.data.recordedBy)))

  const [seminarDocs, customerDocs, recordedByDocs] = await Promise.all([
    Promise.all(uniqueSeminarIds.map((id) => db.collection('seminars').doc(id).get())),
    Promise.all(uniqueCustomerIds.map((id) => db.collection('customers').doc(id).get())),
    Promise.all(uniqueRecordedByUids.map((uid) => db.collection('staff').doc(uid).get())),
  ])

  const seminarInfo: Record<string, { title: string; scheduledAt: string }> = {}
  uniqueSeminarIds.forEach((id, i) => {
    const data = seminarDocs[i].data() as Seminar | undefined
    seminarInfo[id] = {
      title: data?.title ?? id,
      scheduledAt: data?.scheduledAt.toDate().toISOString() ?? '',
    }
  })
  const customerNames: Record<string, string> = {}
  uniqueCustomerIds.forEach((id, i) => {
    customerNames[id] = (customerDocs[i].data()?.name as string | undefined) ?? id
  })
  const recordedByNames: Record<string, string> = {}
  uniqueRecordedByUids.forEach((uid, i) => {
    recordedByNames[uid] = (recordedByDocs[i].data()?.name as string | undefined) ?? uid
  })

  const rows: SeminarAttendanceRow[] = docs.map(({ id, data }) => ({
    id,
    seminarId: data.seminarId,
    seminarTitle: seminarInfo[data.seminarId]?.title ?? data.seminarId,
    seminarScheduledAt: seminarInfo[data.seminarId]?.scheduledAt ?? '',
    customerId: data.customerId,
    customerName: customerNames[data.customerId] ?? data.customerId,
    method: data.method,
    recordedBy: data.recordedBy,
    recordedByName: recordedByNames[data.recordedBy] ?? data.recordedBy,
    recordedAt: data.recordedAt.toDate().toISOString(),
  }))

  await writeAuditLog({
    action: 'seminar_attendance_view',
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    targetUid: filters.customerId ?? null,
    branchId: null,
    details: null,
  })

  return rows
}
