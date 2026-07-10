export type LabResultFlag = 'normal' | 'low' | 'high'

export interface LabResultValue {
  parameter: string
  value: string
  unit: string | null
  referenceRange: string | null
  flag: LabResultFlag | null
}

export interface LabResult {
  id: string
  labOrderId: string
  values: LabResultValue[]
  // Optional feedback/review note alongside the structured values — same
  // write, same collection, not a separate review workflow.
  notes: string | null
  enteredBy: string
  enteredAt: FirebaseFirestore.Timestamp
}
