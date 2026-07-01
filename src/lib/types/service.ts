export interface Service {
  id: string
  name: string
  category: string
  price: number
  durationMinutes: number
  description: string | null
  active: boolean
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
