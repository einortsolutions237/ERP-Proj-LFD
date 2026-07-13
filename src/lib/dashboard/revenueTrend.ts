import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Sale } from '@/lib/types/sale'

export interface RevenueTrendPoint {
  date: string // 'YYYY-MM-DD', UTC calendar day
  revenue: number
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Reuses buildSalesReport's exact scoping convention (role === 'branch_manager',
// not isBranchLocked) since this shares the same reports.sales.view capability
// and must behave identically for who sees what — see GET /api/reports/sales,
// deliberately left unchanged since Phase 20.
export async function buildRevenueTrend(user: SessionUser, days = 30): Promise<RevenueTrendPoint[]> {
  if (!hasCapability(user.role, 'reports.sales.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const end = new Date()
  end.setUTCHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  start.setUTCHours(0, 0, 0, 0)

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = user.role === 'branch_manager'
    ? db.collection('sales').where('branchId', '==', user.branchId)
    : db.collection('sales')
  query = query.where('createdAt', '>=', start).where('createdAt', '<=', end)
  const snap = await query.get()

  const byDay = new Map<string, number>()
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    byDay.set(dayKey(d), 0)
  }

  for (const doc of snap.docs) {
    const sale = doc.data() as Sale
    if (sale.voidedAt) continue // voided sales never contribute to revenue, matching buildSalesReport
    const key = dayKey(sale.createdAt.toDate())
    byDay.set(key, (byDay.get(key) ?? 0) + sale.total)
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, revenue]) => ({ date, revenue }))
}
