export type LabOrderStatus = 'ordered' | 'completed'

export interface LabOrder {
  id: string
  customerId: string
  doctorUid: string
  branchId: string
  testName: string
  instructions: string | null
  status: LabOrderStatus
  orderedAt: FirebaseFirestore.Timestamp
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
