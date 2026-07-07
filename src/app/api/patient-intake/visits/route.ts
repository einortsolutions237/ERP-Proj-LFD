import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { IntakeQuestionnaire } from '@/lib/types/intakeQuestionnaire'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlainStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === 'string')
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

    let appointmentId: string | null = null
    if ('appointmentId' in body && body.appointmentId !== undefined && body.appointmentId !== null && body.appointmentId !== '') {
      if (!isNonEmptyString(body.appointmentId)) {
        return NextResponse.json({ error: 'appointmentId must be a string or null' }, { status: 400 })
      }
      const apptSnap = await db.collection('appointments').doc(body.appointmentId.trim()).get()
      if (!apptSnap.exists || apptSnap.data()?.customerId !== customerId) {
        return NextResponse.json({ error: 'appointmentId does not reference an existing appointment for this customer' }, { status: 400 })
      }
      appointmentId = body.appointmentId.trim()
    }

    let vitals: Record<string, string> = {}
    if ('vitals' in body && body.vitals !== undefined && body.vitals !== null) {
      if (!isPlainStringRecord(body.vitals)) {
        return NextResponse.json({ error: 'vitals must be a plain object of string values' }, { status: 400 })
      }
      vitals = body.vitals
    }

    let submittedAnswers: string[] = []
    if ('answers' in body && body.answers !== undefined && body.answers !== null) {
      if (!Array.isArray(body.answers) || !body.answers.every((a: unknown) => typeof a === 'string')) {
        return NextResponse.json({ error: 'answers must be an array of strings' }, { status: 400 })
      }
      submittedAnswers = body.answers
    }

    // Server-side snapshot: question text is read fresh from the live
    // template right now and zipped positionally with the submitted
    // answers — never taken from client-supplied text. A client submitting
    // fewer answers than there are current questions is normal (a nurse
    // leaving some blank), not an error — missing trailing entries become
    // empty strings rather than rejecting the whole submission.
    const questionnaireSnap = await db.collection('intakeQuestionnaire').doc('default').get()
    const questions = questionnaireSnap.exists ? (questionnaireSnap.data() as IntakeQuestionnaire).questions : []
    const answers = questions.map((question, i) => ({ question, answer: submittedAnswers[i] ?? '' }))

    const visitData = {
      customerId,
      appointmentId,
      branchId: user.branchId,
      vitals,
      answers,
      recordedBy: user.uid,
      recordedAt: new Date(),
    }
    const docRef = await db.collection('nursingVisits').add(visitData)

    await writeAuditLog({
      action: 'nursing_visit_record',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: customerId,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
