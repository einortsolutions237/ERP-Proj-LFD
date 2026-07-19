import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Sale, SaleLineItem, SalePayment } from '@/lib/types/sale'
import type { PendingDelivery, PendingDeliveryStatus } from '@/lib/types/pendingDelivery'

export interface SaleDetailPendingDelivery {
  id: string
  productId: string
  productName: string
  quantityOwed: number
  status: PendingDeliveryStatus
  fulfilledByName: string | null
  fulfilledAt: string | null
}

export interface SaleDetail {
  id: string
  branchId: string
  branchName: string
  createdAt: string
  cashierUid: string
  cashierName: string
  customerId: string | null
  customerName: string | null
  lineItems: SaleLineItem[]
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  payments: SalePayment[]
  voided: boolean
  voidedAt: string | null
  voidedBy: string | null
  voidedByName: string | null
  voidReason: string | null
  pendingDeliveries: SaleDetailPendingDelivery[]
}

// Called by /pos/sales/[id] — the same belt-and-suspenders capability
// recheck as getPendingDeliveries/getAppointments/getLabRecords, even though
// the page itself already gates on pos.sale.view before calling this.
//
// Returns null for both "doesn't exist" and "exists in a branch this
// branch-locked viewer can't see" — deliberately indistinguishable, same as
// the "don't reveal a sale exists in another branch" behavior this replaces,
// now keyed off isBranchLocked() instead of an unconditional branchId
// comparison, matching GET /api/sales's Phase 20 fix.
export async function getSaleDetail(saleId: string, viewer: SessionUser): Promise<SaleDetail | null> {
  if (!hasCapability(viewer.role, 'pos.sale.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const saleSnap = await db.collection('sales').doc(saleId).get()
  if (!saleSnap.exists) return null

  const sale = saleSnap.data() as Sale
  if (isBranchLocked(viewer.role) && sale.branchId !== viewer.branchId) return null

  const deliveriesSnap = await db.collection('pendingDeliveries').where('saleId', '==', saleId).get()
  const deliveryDocs = deliveriesSnap.docs.map((d) => ({ id: d.id, data: d.data() as PendingDelivery }))

  const uniqueProductIds = Array.from(new Set(deliveryDocs.map((d) => d.data.productId)))
  const uniqueStaffUids = Array.from(
    new Set(
      [sale.cashierUid, sale.voidedAt ? sale.voidedBy : null, ...deliveryDocs.map((d) => d.data.fulfilledBy)].filter(
        (uid): uid is string => uid !== null && uid !== undefined
      )
    )
  )

  const [branchDoc, customerDoc, productDocs, staffDocs] = await Promise.all([
    db.collection('branches').doc(sale.branchId).get(),
    sale.customerId ? db.collection('customers').doc(sale.customerId).get() : Promise.resolve(null),
    Promise.all(uniqueProductIds.map((id) => db.collection('products').doc(id).get())),
    Promise.all(uniqueStaffUids.map((uid) => db.collection('staff').doc(uid).get())),
  ])

  const productNames: Record<string, string> = {}
  uniqueProductIds.forEach((id, i) => {
    productNames[id] = (productDocs[i].data()?.name as string | undefined) ?? id
  })
  const staffNames: Record<string, string> = {}
  uniqueStaffUids.forEach((uid, i) => {
    staffNames[uid] = (staffDocs[i].data()?.name as string | undefined) ?? uid
  })

  return {
    id: saleId,
    branchId: sale.branchId,
    branchName: (branchDoc.data()?.name as string | undefined) ?? sale.branchId,
    createdAt: sale.createdAt.toDate().toISOString(),
    cashierUid: sale.cashierUid,
    cashierName: staffNames[sale.cashierUid] ?? sale.cashierUid,
    customerId: sale.customerId,
    customerName: sale.customerId ? ((customerDoc?.data()?.name as string | undefined) ?? sale.customerId) : null,
    lineItems: sale.lineItems,
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    taxAmount: sale.taxAmount,
    total: sale.total,
    payments: sale.payments,
    voided: sale.voidedAt != null,
    voidedAt: sale.voidedAt ? sale.voidedAt.toDate().toISOString() : null,
    voidedBy: sale.voidedBy,
    voidedByName: sale.voidedBy ? (staffNames[sale.voidedBy] ?? sale.voidedBy) : null,
    voidReason: sale.voidReason,
    pendingDeliveries: deliveryDocs.map(({ id, data }) => ({
      id,
      productId: data.productId,
      productName: productNames[data.productId] ?? data.productId,
      quantityOwed: data.quantityOwed,
      status: data.status,
      fulfilledByName: data.fulfilledBy ? (staffNames[data.fulfilledBy] ?? data.fulfilledBy) : null,
      fulfilledAt: data.fulfilledAt ? data.fulfilledAt.toDate().toISOString() : null,
    })),
  }
}
