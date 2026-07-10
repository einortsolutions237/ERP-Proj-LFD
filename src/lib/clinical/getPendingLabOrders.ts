import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { LabOrder } from '@/lib/types/labOrder'

export interface PendingLabOrderRow {
  id: string
  customerId: string
  customerName: string
  testName: string
  doctorUid: string
  doctorName: string
  orderedAt: string
}

// Genuinely new read pattern vs. getLabRecords: unscoped by customerId,
// org-wide and cross-branch, consistent with clinical.lab.view already
// being org-wide rather than branch-scoped. Gated on
// clinical.lab.results.enter rather than clinical.lab.view — the worklist
// is for the people who actually act on a pending order (doctor,
// lab_staff, super_admin), not everyone who can merely view results
// (medical_secretary/general_manager/nurse do not get this view).
export async function getPendingLabOrders(viewer: SessionUser): Promise<PendingLabOrderRow[]> {
  if (!hasCapability(viewer.role, 'clinical.lab.results.enter')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const snap = await db
    .collection('labOrders')
    .where('status', '==', 'ordered')
    .orderBy('orderedAt', 'asc')
    .get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as LabOrder }))
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

  const rows: PendingLabOrderRow[] = docs.map(({ id, data }) => ({
    id,
    customerId: data.customerId,
    customerName: customerNames[data.customerId] ?? data.customerId,
    testName: data.testName,
    doctorUid: data.doctorUid,
    doctorName: doctorNames[data.doctorUid] ?? data.doctorUid,
    orderedAt: data.orderedAt.toDate().toISOString(),
  }))

  await writeAuditLog({
    action: 'lab_worklist_view',
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    targetUid: null,
    branchId: null,
    details: null,
  })

  return rows
}
