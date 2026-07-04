export interface Treatment {
  id: string
  customerId: string
  doctorUid: string
  branchId: string
  date: FirebaseFirestore.Timestamp
  diagnosis: string
  notes: string | null
  prescription: string | null
  linkedSaleId: string | null
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
