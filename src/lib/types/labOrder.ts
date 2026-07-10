export type LabOrderStatus = 'ordered' | 'completed'

export interface LabOrder {
  id: string
  customerId: string
  doctorUid: string
  branchId: string
  testName: string
  instructions: string | null
  // Optional link to the treatment/consultation that requested this test.
  // Set automatically when ordered from within a treatment record; null
  // for standalone ordering (e.g. directly from the customer's lab
  // section). Nullable by design — standalone ordering must stay possible.
  treatmentId: string | null
  status: LabOrderStatus
  orderedAt: FirebaseFirestore.Timestamp
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
