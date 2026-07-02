export interface ProductStock {
  id: string
  branchId: string
  productId: string
  quantity: number
  updatedAt: FirebaseFirestore.Timestamp
}

export type StockMovementType = 'restock' | 'adjustment' | 'waste' | 'transfer_out' | 'transfer_in'

export interface StockMovement {
  id: string
  productId: string
  branchId: string
  type: StockMovementType
  quantityDelta: number
  reason: string | null
  actorUid: string
  createdAt: FirebaseFirestore.Timestamp
  transferId: string | null
}
