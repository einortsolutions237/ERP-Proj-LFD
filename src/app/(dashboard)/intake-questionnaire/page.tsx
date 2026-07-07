import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import QuestionnaireEditor from '@/components/clinical/QuestionnaireEditor'
import type { IntakeQuestionnaire } from '@/lib/types/intakeQuestionnaire'

export default async function IntakeQuestionnairePage() {
  try {
    await requireCapability('clinical.questionnaire.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore().collection('intakeQuestionnaire').doc('default').get()
  const questions = snap.exists ? (snap.data() as IntakeQuestionnaire).questions : []

  return (
    <div className="mx-auto mt-12 max-w-2xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Intake questionnaire</h1>
      <QuestionnaireEditor initialQuestions={questions} />
    </div>
  )
}
