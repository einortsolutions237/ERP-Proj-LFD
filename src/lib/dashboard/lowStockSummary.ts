import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { ProductStock } from '@/lib/types/stock'
import type { Product } from '@/lib/types/product'
import { isLowStock } from '@/lib/inventory/lowStock'

export interface LowStockRow {
  productId: string
  productName: string
  branchId: string
  branchName: string
  quantity: number
  reorderThreshold: number
}

export interface LowStockSummary {
  rows: LowStockRow[]
  totalCount: number
}

// Gated on inventory.stock.view (held today by super_admin/branch_manager
// only, via BRANCH_LOCKED_ROLES' sibling BRANCH_MANAGER_ONLY) — deliberately
// NOT reports.inventory.view/buildInventoryReport's role === 'branch_manager'
// scoping, since that's a different capability with a different, wider role
// set. isBranchLocked matches this widget's own capability's actual read
// route (stock/page.tsx, Phase-12-fixed), not the unrelated reports pattern.
export async function getDashboardLowStock(viewer: SessionUser): Promise<LowStockSummary> {
  if (!hasCapability(viewer.role, 'inventory.stock.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const stockQuery: FirebaseFirestore.Query = isBranchLocked(viewer.role)
    ? db.collection('productStock').where('branchId', '==', viewer.branchId)
    : db.collection('productStock')

  const [stockSnap, productsSnap, branchesSnap] = await Promise.all([
    stockQuery.get(),
    db.collection('products').get(),
    db.collection('branches').get(),
  ])
  const productsById = new Map(productsSnap.docs.map((d) => [d.id, d.data() as Product]))
  const branchNamesById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))

  const lowStockRows: LowStockRow[] = []
  for (const doc of stockSnap.docs) {
    const stock = doc.data() as ProductStock
    const product = productsById.get(stock.productId)
    if (!product) continue // orphaned stock row (deleted product) — skip, don't crash the widget
    if (!isLowStock(stock.quantity, product.reorderThreshold)) continue

    lowStockRows.push({
      productId: stock.productId,
      productName: product.name,
      branchId: stock.branchId,
      branchName: branchNamesById.get(stock.branchId) ?? stock.branchId,
      quantity: stock.quantity,
      reorderThreshold: product.reorderThreshold,
    })
  }

  lowStockRows.sort((a, b) => (b.reorderThreshold - b.quantity) - (a.reorderThreshold - a.quantity))

  return {
    rows: lowStockRows.slice(0, 5),
    totalCount: lowStockRows.length,
  }
}
