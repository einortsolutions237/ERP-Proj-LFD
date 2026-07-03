import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import type { Sale } from '@/lib/types/sale'

// Thrown for invalid startDate/endDate query params. The route (or any other
// caller, e.g. Task 5's server component) is responsible for turning this
// into a 400 response — buildSalesReport itself has no notion of HTTP.
export class ReportValidationError extends Error {}

function defaultRange(): { start: Date; end: Date } {
  const end = new Date()
  end.setUTCHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)
  start.setUTCHours(0, 0, 0, 0)
  return { start, end }
}

function parseRange(startParam: string | null, endParam: string | null): { start: Date; end: Date } | 'invalid-date' | 'invalid-order' | null {
  if (!startParam && !endParam) return defaultRange()
  if (!startParam || !endParam) return null // both-or-neither; a lone param is invalid input
  const start = new Date(`${startParam}T00:00:00.000Z`)
  const end = new Date(`${endParam}T23:59:59.999Z`)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'invalid-date'
  if (end < start) return 'invalid-order'
  return { start, end }
}

export interface SalesReport {
  range: { start: string; end: string }
  revenueTotal: number
  nonVoidedCount: number
  averageSaleValue: number
  voidedCount: number
  voidedTotal: number
  byBranch: Array<{ branchId: string; branchName: string; revenue: number; count: number }>
  byPaymentMethod: Array<{ method: string; amount: number }>
  topSellers: Array<{ type: 'product' | 'service'; itemId: string; name: string; quantity: number; revenue: number }>
}

export async function buildSalesReport(
  user: SessionUser,
  startParam: string | null,
  endParam: string | null
): Promise<SalesReport> {
  const parsed = parseRange(startParam, endParam)
  // A lone param (missing its pair) and an unparseable date both surface as
  // the same "must be valid dates" 400 per the brief's wording; only a valid
  // but backwards range gets the more specific ordering message.
  if (parsed === null || parsed === 'invalid-date') {
    throw new ReportValidationError('startDate and endDate must be valid dates')
  }
  if (parsed === 'invalid-order') {
    throw new ReportValidationError('endDate must be on or after startDate')
  }
  const { start, end } = parsed

  const db = getAdminFirestore()

  let query: FirebaseFirestore.Query = user.role === 'branch_manager'
    ? db.collection('sales').where('branchId', '==', user.branchId)
    : db.collection('sales')
  query = query.where('createdAt', '>=', start).where('createdAt', '<=', end)
  const snap = await query.get()

  let revenueTotal = 0
  let nonVoidedCount = 0
  let voidedCount = 0
  let voidedTotal = 0
  const byBranch = new Map<string, { revenue: number; count: number }>()
  const byPaymentMethod = new Map<string, number>()
  const byItem = new Map<string, { type: 'product' | 'service'; itemId: string; name: string; quantity: number; revenue: number }>()

  for (const doc of snap.docs) {
    const sale = doc.data() as Sale
    if (sale.voidedAt) {
      voidedCount++
      voidedTotal += sale.total
      continue // voided sales never contribute to revenue/branch/payment/item aggregates
    }
    revenueTotal += sale.total
    nonVoidedCount++

    const branchEntry = byBranch.get(sale.branchId) ?? { revenue: 0, count: 0 }
    branchEntry.revenue += sale.total
    branchEntry.count += 1
    byBranch.set(sale.branchId, branchEntry)

    for (const payment of sale.payments) {
      byPaymentMethod.set(payment.method, (byPaymentMethod.get(payment.method) ?? 0) + payment.amount)
    }

    for (const item of sale.lineItems) {
      const key = `${item.type}:${item.itemId}`
      const itemEntry = byItem.get(key) ?? { type: item.type, itemId: item.itemId, name: item.name, quantity: 0, revenue: 0 }
      itemEntry.quantity += item.quantity
      itemEntry.revenue += item.lineTotal
      byItem.set(key, itemEntry)
    }
  }

  const averageSaleValue = nonVoidedCount > 0 ? revenueTotal / nonVoidedCount : 0

  // Branch names for display: fetch branches (org-wide, small collection,
  // fetch all and build an id->name map) rather than one read per branch.
  const branchesSnap = await db.collection('branches').get()
  const branchNameById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))

  const byBranchArray = Array.from(byBranch.entries()).map(([branchId, entry]) => ({
    branchId,
    branchName: branchNameById.get(branchId) ?? branchId,
    revenue: entry.revenue,
    count: entry.count,
  }))

  const byPaymentMethodArray = Array.from(byPaymentMethod.entries()).map(([method, amount]) => ({ method, amount }))

  const topSellers = Array.from(byItem.values())
    .map(({ type, itemId, name, quantity, revenue }) => ({ type, itemId, name, quantity, revenue }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    revenueTotal,
    nonVoidedCount,
    averageSaleValue,
    voidedCount,
    voidedTotal,
    byBranch: byBranchArray,
    byPaymentMethod: byPaymentMethodArray,
    topSellers,
  }
}
