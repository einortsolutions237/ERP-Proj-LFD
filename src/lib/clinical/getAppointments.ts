import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Appointment, AppointmentStatus } from '@/lib/types/appointment'

export interface AppointmentRow {
  id: string
  customerId: string
  customerName: string
  doctorUid: string
  doctorName: string
  scheduledAt: string
  durationMinutes: number
  status: AppointmentStatus
  reason: string | null
  cancellationReason: string | null
}

export interface AppointmentFilters {
  doctorUid?: string
  customerId?: string
  upcomingOnly?: boolean
}

// Called by both GET /api/appointments and any page listing appointments
// (the schedule page in Task 6, the customer detail page's "Upcoming
// appointments" section in Task 7) — same single-call-site-for-audit-
// logging discipline as getPatientTreatments, so "viewing the schedule is
// read-audit-logged" is true by construction rather than by two copies
// staying in sync. Re-checks the capability itself rather than trusting
// the caller already did, same belt-and-suspenders discipline as
// getPatientTreatments/StaffTable's super_admin delete guard.
export async function getAppointments(filters: AppointmentFilters, viewer: SessionUser): Promise<AppointmentRow[]> {
  if (!hasCapability(viewer.role, 'clinical.appointments.manage')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('appointments')
  if (filters.customerId) query = query.where('customerId', '==', filters.customerId)
  if (filters.doctorUid) query = query.where('doctorUid', '==', filters.doctorUid)
  if (filters.upcomingOnly) {
    query = query.where('status', '==', 'scheduled').where('scheduledAt', '>=', new Date())
  }
  query = query.orderBy('scheduledAt', 'asc')
  const snap = await query.get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Appointment }))
  const uniqueDoctorUids = Array.from(new Set(docs.map((d) => d.data.doctorUid)))
  const uniqueCustomerIds = Array.from(new Set(docs.map((d) => d.data.customerId)))
  const [doctorDocs, customerDocs] = await Promise.all([
    Promise.all(uniqueDoctorUids.map((uid) => db.collection('staff').doc(uid).get())),
    Promise.all(uniqueCustomerIds.map((id) => db.collection('customers').doc(id).get())),
  ])
  const doctorNames: Record<string, string> = {}
  uniqueDoctorUids.forEach((uid, i) => {
    doctorNames[uid] = (doctorDocs[i].data()?.name as string | undefined) ?? uid
  })
  const customerNames: Record<string, string> = {}
  uniqueCustomerIds.forEach((id, i) => {
    customerNames[id] = (customerDocs[i].data()?.name as string | undefined) ?? id
  })

  const rows: AppointmentRow[] = docs.map(({ id, data }) => ({
    id,
    customerId: data.customerId,
    customerName: customerNames[data.customerId] ?? data.customerId,
    doctorUid: data.doctorUid,
    doctorName: doctorNames[data.doctorUid] ?? data.doctorUid,
    scheduledAt: data.scheduledAt.toDate().toISOString(),
    durationMinutes: data.durationMinutes,
    status: data.status,
    reason: data.reason,
    cancellationReason: data.cancellationReason,
  }))

  await writeAuditLog({
    action: 'appointment_view',
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    targetUid: filters.customerId ?? null,
    branchId: null,
    details: null,
  })

  return rows
}
