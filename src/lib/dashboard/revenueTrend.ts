import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasEffectiveCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Sale } from '@/lib/types/sale'

export interface RevenueTrendPoint {
  date: string // 'YYYY-MM-DD', UTC calendar day
  revenue: number
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Must match buildSalesReport's scoping exactly (same reports.sales.view
// capability, same isBranchLocked predicate) — see Phase 42's H-2 fix,
// which moved both together specifically to prevent this widget and the
// Sales report disagreeing about who sees what.
export async function buildRevenueTrend(user: SessionUser, days = 30): Promise<RevenueTrendPoint[]> {
  if (!hasEffectiveCapability(user, 'reports.sales.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const end = new Date()
  end.setUTCHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  start.setUTCHours(0, 0, 0, 0)

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = isBranchLocked(user.role)
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
