export interface NursingVisitAnswer {
  question: string
  answer: string
}

export interface NursingVisit {
  id: string
  customerId: string
  appointmentId: string | null
  branchId: string
  // Deliberately a loose, untyped-per-field object, not a rigid schema —
  // more measurements may be added later without a type change. Common
  // keys today: height, weight, bloodPressure.
  vitals: Record<string, string>
  // question is the actual text copied from intakeQuestionnaire at the
  // moment this visit was recorded (server-side, at write time — see
  // src/app/api/patient-intake/visits/route.ts) — never a live reference
  // to the template, so editing the template later cannot alter history.
  answers: NursingVisitAnswer[]
  recordedBy: string
  recordedAt: FirebaseFirestore.Timestamp
}
