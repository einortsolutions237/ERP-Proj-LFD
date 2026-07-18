export interface Expense {
  id: string
  date: FirebaseFirestore.Timestamp
  category: string
  amount: number
  description: string
  branchId: string
  recordedBy: string
  createdAt: FirebaseFirestore.Timestamp
}
