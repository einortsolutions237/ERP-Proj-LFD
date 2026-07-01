export interface Branch {
  id: string
  name: string
  address: string
  phone: string | null
  active: boolean
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
