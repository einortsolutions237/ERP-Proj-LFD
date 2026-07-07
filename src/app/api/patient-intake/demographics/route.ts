import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { PatientDemographics } from '@/lib/types/patientDemographics'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalTrimmedString(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new AuthError(`${field} must be a string or null`, 400)
  return value.trim()
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('clinical.intake.record')
    const body = await request.json()

    if (!isNonEmptyString(body.customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    const customerId = body.customerId.trim()

    const db = getAdminFirestore()
    const customerSnap = await db.collection('customers').doc(customerId).get()
    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
    }

    let maritalStatus: string | null
    let religion: string | null
    let occupation: string | null
    let referralName: string | null
    try {
      maritalStatus = optionalTrimmedString(body.maritalStatus, 'maritalStatus')
      religion = optionalTrimmedString(body.religion, 'religion')
      occupation = optionalTrimmedString(body.occupation, 'occupation')
      referralName = optionalTrimmedString(body.referralName, 'referralName')
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    const ref = db.collection('patientDemographics').doc(customerId)
    const existing = await ref.get()
    const now = new Date()

    // Doc ID = customerId — deterministic, one record per customer.
    // Full-object set() (not merge) since we already read and preserve the
    // original recordedBy/recordedAt below; a plain read-then-write is fine
    // here (scalar fact-updates, not a numeric quantity computation, so no
    // transaction is needed).
    const data = {
      customerId,
      maritalStatus,
      religion,
      occupation,
      referralName,
      recordedBy: existing.exists ? (existing.data() as PatientDemographics).recordedBy : user.uid,
      recordedAt: existing.exists ? (existing.data() as PatientDemographics).recordedAt : now,
      updatedAt: now,
    }
    await ref.set(data)

    await writeAuditLog({
      action: 'patient_demographics_record',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: customerId,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ ok: true }, { status: existing.exists ? 200 : 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
