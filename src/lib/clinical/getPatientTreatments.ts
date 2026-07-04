import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Treatment } from '@/lib/types/treatment'

export interface TreatmentRow {
  id: string
  doctorUid: string
  doctorName: string
  date: string
  diagnosis: string
  notes: string | null
  prescription: string | null
  linkedSaleId: string | null
}

// Called by both GET /api/treatments and customers/[id]/page.tsx directly
// (a Server Component, matching every other page in this app's own direct-
// Admin-SDK-read pattern — it does not make an HTTP call to the sibling
// API route). Re-checks the capability itself rather than trusting the
// caller already did, the same belt-and-suspenders discipline as
// StaffTable's super_admin delete guard.
export async function getPatientTreatments(customerId: string, viewer: SessionUser): Promise<TreatmentRow[]> {
  if (!hasCapability(viewer.role, 'clinical.record.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  // Org-wide on purpose — a patient's clinical history spans every branch
  // they were ever seen at; there is no isBranchLocked check here at all,
  // deliberately, since every clinical.record.view holder is non-branch-locked.
  const snap = await db
    .collection('treatments')
    .where('customerId', '==', customerId)
    .orderBy('date', 'desc')
    .get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Treatment }))
  const uniqueDoctorUids = Array.from(new Set(docs.map((d) => d.data.doctorUid)))
  const doctorDocs = await Promise.all(uniqueDoctorUids.map((uid) => db.collection('staff').doc(uid).get()))
  const doctorNames: Record<string, string> = {}
  uniqueDoctorUids.forEach((uid, i) => {
    doctorNames[uid] = (doctorDocs[i].data()?.name as string | undefined) ?? uid
  })

  const rows: TreatmentRow[] = docs.map(({ id, data }) => ({
    id,
    doctorUid: data.doctorUid,
    doctorName: doctorNames[data.doctorUid] ?? data.doctorUid,
    date: data.date.toDate().toISOString().slice(0, 10),
    diagnosis: data.diagnosis,
    notes: data.notes,
    prescription: data.prescription,
    linkedSaleId: data.linkedSaleId,
  }))

  await writeAuditLog({
    action: 'clinical_record_view',
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    targetUid: customerId,
    branchId: null,
    details: null,
  })

  return rows
}
