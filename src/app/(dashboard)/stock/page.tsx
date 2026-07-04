import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import StockTable, { type StockRow } from '@/components/stock/StockTable'

export default async function StockPage() {
  let user
  try {
    user = await requireCapability('inventory.stock.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const [stockSnap, productsSnap, branchesSnap] = await Promise.all([
    isBranchLocked(user.role)
      ? db.collection('productStock').where('branchId', '==', user.branchId).get()
      : db.collection('productStock').get(),
    // Unfiltered on purpose: products are an org-wide catalog collection, not
    // branch-scoped (same reasoning as the products list page).
    db.collection('products').get(),
    // Unfiltered on purpose: branches are informational here (transfer
    // destinations), not "branch management" — no admin.branches.manage gate.
    db.collection('branches').get(),
  ])

  const productsById = new Map(productsSnap.docs.map((d) => [d.id, d.data()]))

  const rows: StockRow[] = stockSnap.docs.flatMap((d) => {
    const data = d.data()
    const product = productsById.get(data.productId as string)
    if (!product) return []
    const quantity = data.quantity as number
    const reorderThreshold = product.reorderThreshold as number
    return [
      {
        id: d.id,
        branchId: data.branchId as string,
        productId: data.productId as string,
        productName: product.name as string,
        sku: product.sku as string,
        quantity,
        reorderThreshold,
        lowStock: quantity < reorderThreshold,
      },
    ]
  })

  const branches = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))

  const canAdjust = hasCapability(user.role, 'inventory.stock.adjust')
  const canTransfer = hasCapability(user.role, 'inventory.stock.transfer')

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Stock</h1>
      <StockTable
        rows={rows}
        branches={branches}
        canAdjust={canAdjust}
        canTransfer={canTransfer}
      />
    </div>
  )
}
