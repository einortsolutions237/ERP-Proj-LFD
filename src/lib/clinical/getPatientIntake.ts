import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { PatientDemographics } from '@/lib/types/patientDemographics'
import type { NursingVisit } from '@/lib/types/nursingVisit'

export interface PatientDemographicsRow {
  maritalStatus: string | null
  religion: string | null
  occupation: string | null
  referralName: string | null
  recordedBy: string
  recordedByName: string
  recordedAt: string
  updatedAt: string
}

export interface NursingVisitRow {
  id: string
  appointmentId: string | null
  vitals: Record<string, string>
  answers: { question: string; answer: string }[]
  recordedBy: string
  recordedByName: string
  recordedAt: string
}

export interface PatientIntake {
  demographics: PatientDemographicsRow | null
  visits: NursingVisitRow[]
}

// Called by both GET /api/patient-intake and customers/[id]/page.tsx
// directly (a Server Component, matching every other clinical read helper's
// direct-Admin-SDK-read pattern) — same single-call-site-for-audit-logging
// discipline as getPatientTreatments/getLabRecords/getAppointments, so
// "viewing intake data is read-audit-logged" is true by construction.
// Re-checks the capability itself rather than trusting the caller already
// did, same belt-and-suspenders discipline as its clinical precedents.
export async function getPatientIntake(customerId: string, viewer: SessionUser): Promise<PatientIntake> {
  if (!hasCapability(viewer.role, 'clinical.intake.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()

  const [demographicsSnap, visitsSnap] = await Promise.all([
    db.collection('patientDemographics').doc(customerId).get(),
    db.collection('nursingVisits').where('customerId', '==', customerId).orderBy('recordedAt', 'desc').get(),
  ])

  const visitDocs = visitsSnap.docs.map((d) => ({ id: d.id, data: d.data() as NursingVisit }))
  const uniqueRecordedByUids = Array.from(
    new Set([
      ...(demographicsSnap.exists ? [(demographicsSnap.data() as PatientDemographics).recordedBy] : []),
      ...visitDocs.map((v) => v.data.recordedBy),
    ])
  )
  const recordedByDocs = await Promise.all(uniqueRecordedByUids.map((uid) => db.collection('staff').doc(uid).get()))
  const recordedByNames: Record<string, string> = {}
  uniqueRecordedByUids.forEach((uid, i) => {
    recordedByNames[uid] = (recordedByDocs[i].data()?.name as string | undefined) ?? uid
  })

  const demographics: PatientDemographicsRow | null = demographicsSnap.exists
    ? (() => {
        const d = demographicsSnap.data() as PatientDemographics
        return {
          maritalStatus: d.maritalStatus,
          religion: d.religion,
          occupation: d.occupation,
          referralName: d.referralName,
          recordedBy: d.recordedBy,
          recordedByName: recordedByNames[d.recordedBy] ?? d.recordedBy,
          recordedAt: d.recordedAt.toDate().toISOString(),
          updatedAt: d.updatedAt.toDate().toISOString(),
        }
      })()
    : null

  const visits: NursingVisitRow[] = visitDocs.map(({ id, data }) => ({
    id,
    appointmentId: data.appointmentId,
    vitals: data.vitals,
    answers: data.answers,
    recordedBy: data.recordedBy,
    recordedByName: recordedByNames[data.recordedBy] ?? data.recordedBy,
    recordedAt: data.recordedAt.toDate().toISOString(),
  }))

  await writeAuditLog({
    action: 'intake_view',
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    targetUid: customerId,
    branchId: null,
    details: null,
  })

  return { demographics, visits }
}
