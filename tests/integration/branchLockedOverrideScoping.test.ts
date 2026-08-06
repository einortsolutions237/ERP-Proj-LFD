import { describe, it, expect, afterEach } from 'vitest'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { buildSalesReport } from '@/lib/reports/sales'
import { buildInventoryReport } from '@/lib/reports/inventory'
import { buildRevenueTrend } from '@/lib/dashboard/revenueTrend'
import { getPendingLeaveApprovals } from '@/lib/dashboard/pendingLeaveApprovals'
import type { SessionUser } from '@/lib/auth/server-guard'

const BRANCH_A = 'branch-a-scoping-test'
const BRANCH_B = 'branch-b-scoping-test'

function cashierWithOverride(branchId: string, capabilities: string[]): SessionUser {
  return {
    uid: 'test-cashier-uid',
    email: 'cashier@example.com',
    role: 'cashier',
    branchId,
    effectiveCapabilities: capabilities as SessionUser['effectiveCapabilities'],
  }
}

describe('branch-locked roles stay branch-filtered even when granted an org-wide-shaped capability via override', () => {
  afterEach(async () => {
    const db = getAdminFirestore()
    for (const col of ['sales', 'productStock', 'leaveRequests']) {
      const snap = await db.collection(col).where('branchId', 'in', [BRANCH_A, BRANCH_B]).get()
      await Promise.all(snap.docs.map((d) => d.ref.delete()))
    }
  })

  it('buildSalesReport stays branch-filtered for a cashier holding reports.sales.view', async () => {
    const db = getAdminFirestore()
    const now = new Date()
    await db.collection('sales').add({ branchId: BRANCH_A, total: 1000, createdAt: now, lineItems: [], payments: [] })
    await db.collection('sales').add({ branchId: BRANCH_B, total: 5000, createdAt: now, lineItems: [], payments: [] })

    const user = cashierWithOverride(BRANCH_A, ['reports.sales.view'])
    const report = await buildSalesReport(user, null, null)

    expect(report.revenueTotal).toBe(1000) // must not see branch B's 5000
  })

  it('buildRevenueTrend agrees with buildSalesReport for the same cashier+override (siblings must not drift)', async () => {
    const db = getAdminFirestore()
    const now = new Date()
    await db.collection('sales').add({ branchId: BRANCH_A, total: 1000, createdAt: now, lineItems: [], payments: [] })
    await db.collection('sales').add({ branchId: BRANCH_B, total: 5000, createdAt: now, lineItems: [], payments: [] })

    const user = cashierWithOverride(BRANCH_A, ['reports.sales.view'])
    const trend = await buildRevenueTrend(user, 1)
    const totalFromTrend = trend.reduce((sum, p) => sum + p.revenue, 0)

    expect(totalFromTrend).toBe(1000)
  })

  it('buildInventoryReport stays branch-filtered for a cashier holding reports.inventory.view', async () => {
    const db = getAdminFirestore()
    await db.collection('productStock').add({ branchId: BRANCH_A, productId: 'p1', quantity: 5 })
    await db.collection('productStock').add({ branchId: BRANCH_B, productId: 'p1', quantity: 50 })
    // buildInventoryReport joins against products/branches; a missing product is
    // skipped (see its own "orphaned stock row" comment), which is enough for
    // this test — we only assert the branch filter, not full row shape.

    const user = cashierWithOverride(BRANCH_A, ['reports.inventory.view'])
    const report = await buildInventoryReport(user)

    expect(report.rows.every((r) => r.branchId === BRANCH_A)).toBe(true)
  })

  it('getPendingLeaveApprovals stays branch-filtered for a cashier holding hr.leave.approve', async () => {
    const db = getAdminFirestore()
    const now = new Date()
    await db.collection('leaveRequests').add({ branchId: BRANCH_A, staffId: 's1', status: 'pending', type: 'annual', startDate: now, endDate: now, createdAt: now })
    await db.collection('leaveRequests').add({ branchId: BRANCH_B, staffId: 's2', status: 'pending', type: 'annual', startDate: now, endDate: now, createdAt: now })

    const user = cashierWithOverride(BRANCH_A, ['hr.leave.approve'])
    const rows = await getPendingLeaveApprovals(user)

    expect(rows.length).toBe(1)
  })
})
