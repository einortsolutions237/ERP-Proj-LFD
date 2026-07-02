export interface Customer {
  id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  notes: string | null
  registeredBranchId: string
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
