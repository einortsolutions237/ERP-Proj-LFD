export type PendingDeliveryStatus = 'pending' | 'fulfilled'

export interface PendingDelivery {
  id: string
  saleId: string
  productId: string
  customerId: string
  branchId: string
  quantityOwed: number
  status: PendingDeliveryStatus
  fulfilledBy: string | null
  fulfilledAt: FirebaseFirestore.Timestamp | null
  createdAt: FirebaseFirestore.Timestamp
}
