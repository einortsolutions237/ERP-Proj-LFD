export interface Supplier {
  id: string
  name: string
  contact: {
    phone: string | null
    email: string | null
    address: string | null
  }
  notes: string | null
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
