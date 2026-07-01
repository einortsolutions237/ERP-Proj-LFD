export interface Product {
  id: string
  name: string
  sku: string
  category: string
  unitCost: number
  price: number
  supplierId: string | null
  reorderThreshold: number
  active: boolean
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
