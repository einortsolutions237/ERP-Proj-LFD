import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { PendingDelivery } from '@/lib/types/pendingDelivery'

export interface DashboardPendingDelivery {
  id: string
  productName: string
  branchName: string
  quantityOwed: number
  createdAt: string
}

export interface PendingDeliveriesSummary {
  rows: DashboardPendingDelivery[]
  totalCount: number
}

export async function getDashboardPendingDeliveries(viewer: SessionUser): Promise<PendingDeliveriesSummary> {
  if (!hasCapability(viewer.role, 'pos.delivery.fulfill')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('pendingDeliveries').where('status', '==', 'pending')
  if (isBranchLocked(viewer.role)) {
    query = query.where('branchId', '==', viewer.branchId)
  }
  query = query.orderBy('createdAt', 'asc')
  const snap = await query.get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as PendingDelivery }))
  const uniqueProductIds = Array.from(new Set(docs.map((d) => d.data.productId)))
  const uniqueBranchIds = Array.from(new Set(docs.map((d) => d.data.branchId)))
  const [productDocs, branchDocs] = await Promise.all([
    Promise.all(uniqueProductIds.map((id) => db.collection('products').doc(id).get())),
    Promise.all(uniqueBranchIds.map((id) => db.collection('branches').doc(id).get())),
  ])
  const productNames: Record<string, string> = {}
  uniqueProductIds.forEach((id, i) => {
    productNames[id] = (productDocs[i].data()?.name as string | undefined) ?? id
  })
  const branchNames: Record<string, string> = {}
  uniqueBranchIds.forEach((id, i) => {
    branchNames[id] = (branchDocs[i].data()?.name as string | undefined) ?? id
  })

  const rows: DashboardPendingDelivery[] = docs.map(({ id, data }) => ({
    id,
    productName: productNames[data.productId] ?? data.productId,
    branchName: branchNames[data.branchId] ?? data.branchId,
    quantityOwed: data.quantityOwed,
    createdAt: data.createdAt.toDate().toISOString(),
  }))

  return {
    rows: rows.slice(0, 5),
    totalCount: rows.length,
  }
}
