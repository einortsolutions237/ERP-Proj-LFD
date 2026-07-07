import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireAnyCapability, requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { IntakeQuestionnaire } from '@/lib/types/intakeQuestionnaire'

const DOC_ID = 'default'

export async function GET() {
  try {
    // Needed by anyone about to record a new visit (clinical.intake.record)
    // or manage the template itself (clinical.questionnaire.manage) — a
    // pure intake.view holder already sees each past visit's own
    // snapshotted question text via GET /api/patient-intake, so they don't
    // need the live template separately.
    await requireAnyCapability(['clinical.intake.record', 'clinical.questionnaire.manage'])
    const db = getAdminFirestore()
    const snap = await db.collection('intakeQuestionnaire').doc(DOC_ID).get()
    const questions = snap.exists ? (snap.data() as IntakeQuestionnaire).questions : []
    return NextResponse.json({ questions })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireCapability('clinical.questionnaire.manage')
    const body = await request.json()

    if (!Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json({ error: 'questions must be a non-empty array' }, { status: 400 })
    }
    if (!body.questions.every((q: unknown) => typeof q === 'string' && q.trim().length > 0)) {
      return NextResponse.json({ error: 'every question must be a non-empty string' }, { status: 400 })
    }
    const questions = body.questions.map((q: string) => q.trim())

    const db = getAdminFirestore()
    await db.collection('intakeQuestionnaire').doc(DOC_ID).set({
      questions,
      updatedBy: user.uid,
      updatedAt: new Date(),
    })

    await writeAuditLog({
      action: 'intake_questionnaire_edit',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
