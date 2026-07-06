import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { PendingDelivery, PendingDeliveryStatus } from '@/lib/types/pendingDelivery'

export interface PendingDeliveryRow {
  id: string
  saleId: string
  productId: string
  productName: string
  quantityOwed: number
  status: PendingDeliveryStatus
  fulfilledByName: string | null
  fulfilledAt: string | null
  createdAt: string
}

// Called by the customer detail page's "Pending deliveries" section — same
// direct-in-process pattern as getAppointments/getLabRecords, except this
// data is stock/sales-adjacent (operational), not clinical, so unlike its
// two precedents it does NOT write its own audit log entry: viewing sales/
// stock movements isn't separately audited anywhere else in this app either
// (see Decision #4 in this phase's plan). Re-checks the capability itself
// rather than trusting the caller already did, same belt-and-suspenders
// discipline as getAppointments/getLabRecords.
export async function getPendingDeliveries(customerId: string, viewer: SessionUser): Promise<PendingDeliveryRow[]> {
  if (!hasCapability(viewer.role, 'pos.delivery.fulfill')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('pendingDeliveries').where('customerId', '==', customerId)
  if (isBranchLocked(viewer.role)) {
    query = query.where('branchId', '==', viewer.branchId)
  }
  query = query.orderBy('createdAt', 'desc')
  const snap = await query.get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as PendingDelivery }))
  const uniqueProductIds = Array.from(new Set(docs.map((d) => d.data.productId)))
  const uniqueFulfilledByUids = Array.from(
    new Set(docs.map((d) => d.data.fulfilledBy).filter((uid): uid is string => uid !== null))
  )
  const [productDocs, staffDocs] = await Promise.all([
    Promise.all(uniqueProductIds.map((id) => db.collection('products').doc(id).get())),
    Promise.all(uniqueFulfilledByUids.map((uid) => db.collection('staff').doc(uid).get())),
  ])
  const productNames: Record<string, string> = {}
  uniqueProductIds.forEach((id, i) => {
    productNames[id] = (productDocs[i].data()?.name as string | undefined) ?? id
  })
  const staffNames: Record<string, string> = {}
  uniqueFulfilledByUids.forEach((uid, i) => {
    staffNames[uid] = (staffDocs[i].data()?.name as string | undefined) ?? uid
  })

  return docs.map(({ id, data }) => ({
    id,
    saleId: data.saleId,
    productId: data.productId,
    productName: productNames[data.productId] ?? data.productId,
    quantityOwed: data.quantityOwed,
    status: data.status,
    fulfilledByName: data.fulfilledBy ? (staffNames[data.fulfilledBy] ?? data.fulfilledBy) : null,
    fulfilledAt: data.fulfilledAt ? data.fulfilledAt.toDate().toISOString() : null,
    createdAt: data.createdAt.toDate().toISOString(),
  }))
}
