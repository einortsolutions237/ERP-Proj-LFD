// A single shared document (fixed doc ID 'default', see
// src/app/api/intake-questionnaire/route.ts) — not per-nurse, not
// per-patient. Editing it changes what every future visit's form shows;
// it never alters the question text already snapshotted onto past
// NursingVisit.answers entries.
export interface IntakeQuestionnaire {
  questions: string[]
  updatedBy: string
  updatedAt: FirebaseFirestore.Timestamp
}
