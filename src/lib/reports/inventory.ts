import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import type { ProductStock } from '@/lib/types/stock'
import type { Product } from '@/lib/types/product'
import { isLowStock } from '@/lib/inventory/lowStock'

export interface InventoryReport {
  rows: Array<{
    productId: string
    productName: string
    branchId: string
    branchName: string
    quantity: number
    reorderThreshold: number
    lowStock: boolean
    value: number
  }>
  totalValue: number
  byBranch: Array<{ branchId: string; branchName: string; totalValue: number }>
}

export async function buildInventoryReport(user: SessionUser): Promise<InventoryReport> {
  const db = getAdminFirestore()

  let stockQuery: FirebaseFirestore.Query = user.role === 'branch_manager'
    ? db.collection('productStock').where('branchId', '==', user.branchId)
    : db.collection('productStock')
  const [stockSnap, productsSnap, branchesSnap] = await Promise.all([
    stockQuery.get(),
    db.collection('products').get(),
    db.collection('branches').get(),
  ])
  const productsById = new Map(productsSnap.docs.map((d) => [d.id, d.data() as Product]))
  const branchNamesById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))

  const rows: InventoryReport['rows'] = []
  const byBranch = new Map<string, number>()
  let totalValue = 0

  for (const doc of stockSnap.docs) {
    const stock = doc.data() as ProductStock
    const product = productsById.get(stock.productId)
    if (!product) continue // orphaned stock row (deleted product) — skip, don't crash the report

    const value = stock.quantity * product.unitCost
    totalValue += value
    byBranch.set(stock.branchId, (byBranch.get(stock.branchId) ?? 0) + value)

    rows.push({
      productId: stock.productId,
      productName: product.name,
      branchId: stock.branchId,
      branchName: branchNamesById.get(stock.branchId) ?? stock.branchId,
      quantity: stock.quantity,
      reorderThreshold: product.reorderThreshold,
      lowStock: isLowStock(stock.quantity, product.reorderThreshold),
      value,
    })
  }

  const byBranchArray = Array.from(byBranch.entries()).map(([branchId, branchTotalValue]) => ({
    branchId,
    branchName: branchNamesById.get(branchId) ?? branchId,
    totalValue: branchTotalValue,
  }))

  return { rows, totalValue, byBranch: byBranchArray }
}
