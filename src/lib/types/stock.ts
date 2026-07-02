export interface ProductStock {
  id: string
  branchId: string
  productId: string
  quantity: number
  updatedAt: FirebaseFirestore.Timestamp
}

export type StockMovementType = 'restock' | 'adjustment' | 'waste' | 'transfer_out' | 'transfer_in' | 'sale' | 'void'

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
  saleId: string | null   // set to the sales/{saleId} doc id only for type:'sale'; null for every other movement type
}
