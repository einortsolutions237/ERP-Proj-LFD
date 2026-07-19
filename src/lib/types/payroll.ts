export interface PayrollRecord {
  id: string
  staffId: string
  payPeriodStart: FirebaseFirestore.Timestamp
  payPeriodEnd: FirebaseFirestore.Timestamp
  grossAmount: number
  branchId: string
  recordedBy: string
  createdAt: FirebaseFirestore.Timestamp
  notes: string | null
}
