import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { LabOrder, LabOrderStatus } from '@/lib/types/labOrder'
import type { LabResult, LabResultFlag } from '@/lib/types/labResult'

export interface LabResultValueRow {
  parameter: string
  value: string
  unit: string | null
  referenceRange: string | null
  flag: LabResultFlag | null
}

export interface LabOrderRow {
  id: string
  customerId: string
  doctorUid: string
  doctorName: string
  testName: string
  instructions: string | null
  status: LabOrderStatus
  orderedAt: string
  result: { values: LabResultValueRow[]; notes: string | null; enteredBy: string; enteredByName: string; enteredAt: string } | null
}

// Called by both GET /api/lab-orders and the customer detail page's Lab
// section (a Server Component, same direct-in-process pattern as
// getPatientTreatments/getAppointments) — same single-call-site-for-
// audit-logging discipline, so "viewing lab data is read-audit-logged"
// is true by construction. Re-checks the capability itself rather than
// trusting the caller already did, same belt-and-suspenders discipline
// as its two clinical precedents.
export async function getLabRecords(customerId: string, viewer: SessionUser): Promise<LabOrderRow[]> {
  if (!hasCapability(viewer.role, 'clinical.lab.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const ordersSnap = await db
    .collection('labOrders')
    .where('customerId', '==', customerId)
    .orderBy('orderedAt', 'desc')
    .get()

  const orders = ordersSnap.docs.map((d) => ({ id: d.id, data: d.data() as LabOrder }))
  const uniqueDoctorUids = Array.from(new Set(orders.map((o) => o.data.doctorUid)))
  const doctorDocs = await Promise.all(uniqueDoctorUids.map((uid) => db.collection('staff').doc(uid).get()))
  const doctorNames: Record<string, string> = {}
  uniqueDoctorUids.forEach((uid, i) => {
    doctorNames[uid] = (doctorDocs[i].data()?.name as string | undefined) ?? uid
  })

  // At most one result per order (a labOrder <-> labResult relationship
  // is 1:0-or-1, not 1:many) — a single equality-filtered, limit(1) query
  // per order, same Promise.all fan-out shape as the name lookups above.
  const resultSnaps = await Promise.all(
    orders.map((o) => db.collection('labResults').where('labOrderId', '==', o.id).limit(1).get())
  )
  const uniqueEnteredByUids = Array.from(
    new Set(resultSnaps.flatMap((s) => s.docs.map((d) => (d.data() as LabResult).enteredBy)))
  )
  const enteredByDocs = await Promise.all(uniqueEnteredByUids.map((uid) => db.collection('staff').doc(uid).get()))
  const enteredByNames: Record<string, string> = {}
  uniqueEnteredByUids.forEach((uid, i) => {
    enteredByNames[uid] = (enteredByDocs[i].data()?.name as string | undefined) ?? uid
  })

  const rows: LabOrderRow[] = orders.map(({ id, data }, i) => {
    const resultDoc = resultSnaps[i].docs[0]
    const result = resultDoc
      ? (() => {
          const r = resultDoc.data() as LabResult
          return {
            values: r.values,
            notes: r.notes,
            enteredBy: r.enteredBy,
            enteredByName: enteredByNames[r.enteredBy] ?? r.enteredBy,
            enteredAt: r.enteredAt.toDate().toISOString(),
          }
        })()
      : null

    return {
      id,
      customerId: data.customerId,
      doctorUid: data.doctorUid,
      doctorName: doctorNames[data.doctorUid] ?? data.doctorUid,
      testName: data.testName,
      instructions: data.instructions,
      status: data.status,
      orderedAt: data.orderedAt.toDate().toISOString(),
      result,
    }
  })

  await writeAuditLog({
    action: 'lab_view',
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    targetUid: customerId,
    branchId: null,
    details: null,
  })

  return rows
}
