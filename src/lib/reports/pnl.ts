import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import { buildSalesReport, ReportValidationError } from './sales'
import type { Expense } from '@/lib/types/expense'

export { ReportValidationError }

export class PnLValidationError extends Error {}

export interface PnLReport {
  range: { start: string; end: string }
  branchId: string | null
  revenueTotal: number
  expenseTotal: number
  netIncome: number
  expensesByCategory: Array<{ category: string; amount: number }>
}

async function resolvePnLBranchFilter(user: SessionUser, branchIdParam: string | null): Promise<string | null> {
  // A branch-locked caller is always pinned to their own branch, param
  // ignored. No accounting role is branch-locked today, but this stays
  // correct if that ever changes — same reasoning as every other
  // isBranchLocked call site in this codebase.
  if (isBranchLocked(user.role)) return user.branchId
  if (!branchIdParam) return null // no filter requested: org-wide
  const db = getAdminFirestore()
  const branchSnap = await db.collection('branches').doc(branchIdParam).get()
  if (!branchSnap.exists) throw new PnLValidationError('branchId does not reference an existing branch')
  return branchIdParam
}

export async function buildPnLReport(
  user: SessionUser,
  startParam: string | null,
  endParam: string | null,
  branchIdParam: string | null
): Promise<PnLReport> {
  // Revenue side: reuse Phase 7's buildSalesReport verbatim, never
  // recomputed from scratch — this is what guarantees the P&L's revenue
  // figure matches /reports/sales for the same range, by construction, not
  // by two independent implementations happening to agree.
  const salesReport = await buildSalesReport(user, startParam, endParam)
  const branchId = await resolvePnLBranchFilter(user, branchIdParam)

  const revenueTotal = branchId
    ? salesReport.byBranch.find((b) => b.branchId === branchId)?.revenue ?? 0
    : salesReport.revenueTotal

  // Same range boundaries buildSalesReport itself already validated and
  // used, parsed back out of its own returned ISO strings rather than
  // re-implementing date parsing/validation a second time in this file.
  const start = new Date(salesReport.range.start)
  const end = new Date(salesReport.range.end)

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('expenses').where('date', '>=', start).where('date', '<=', end)
  if (branchId) query = query.where('branchId', '==', branchId)
  const snap = await query.get()

  let expenseTotal = 0
  const byCategory = new Map<string, number>()
  for (const doc of snap.docs) {
    const expense = doc.data() as Expense
    expenseTotal += expense.amount
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount)
  }

  const expensesByCategory = Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  return {
    range: salesReport.range,
    branchId,
    revenueTotal,
    expenseTotal,
    netIncome: revenueTotal - expenseTotal,
    expensesByCategory,
  }
}
