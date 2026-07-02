export interface SaleLineItem {
  type: 'product' | 'service'
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface SalePayment {
  method: 'cash' | 'mtn_momo' | 'orange_money'
  amount: number
  reference: string | null
}

export interface Sale {
  id: string
  branchId: string
  lineItems: SaleLineItem[]
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  payments: SalePayment[]
  cashierUid: string
  createdAt: FirebaseFirestore.Timestamp
}
