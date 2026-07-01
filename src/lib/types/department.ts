export interface Department {
  id: string
  name: string
  branchId: string
  active: boolean
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
