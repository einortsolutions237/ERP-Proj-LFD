import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedSale } from '../setup/fixtures'
import { buildRevenueTrend } from '@/lib/dashboard/revenueTrend'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('buildRevenueTrend', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let superAdminUser: SessionUser
  let financeAdminUser: SessionUser
  let cashierUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Revenue Trend Branch A')
    const b = await seedBranch('Dashboard Revenue Trend Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-revtrend-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    superAdminUser = { uid: 'dashboard-revtrend-sa', email: 'sa@test.local', role: 'super_admin', branchId: branchA }
    financeAdminUser = { uid: 'dashboard-revtrend-fa', email: 'fa@test.local', role: 'finance_admin', branchId: branchA }
    cashierUser = { uid: 'dashboard-revtrend-cash', email: 'cash@test.local', role: 'cashier', branchId: branchA }

    const today = new Date()
    today.setUTCHours(12, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const outsideWindow = new Date(today)
    outsideWindow.setUTCDate(outsideWindow.getUTCDate() - 40)

    await seedSale({ branchId: branchA, total: 1000, createdAt: today })
    await seedSale({ branchId: branchA, total: 500, createdAt: yesterday })
    await seedSale({ branchId: branchA, total: 9999, createdAt: today, voidedAt: today })
    await seedSale({ branchId: branchB, total: 300, createdAt: today })
    await seedSale({ branchId: branchA, total: 7777, createdAt: outsideWindow })
  })

  it('buckets non-voided branch-A revenue by UTC day, excludes voided sales and sales outside the 30-day window, for a branch_manager', async () => {
    const trend = await buildRevenueTrend(branchManagerUser, 30)
    expect(trend).toHaveLength(30)
    const totalRevenue = trend.reduce((sum, p) => sum + p.revenue, 0)
    expect(totalRevenue).toBe(1500) // 1000 (today) + 500 (yesterday); voided 9999 and outside-window 7777 both excluded
    const todayKey = new Date().toISOString().slice(0, 10)
    expect(trend[trend.length - 1].date).toBe(todayKey)
    expect(trend[trend.length - 1].revenue).toBe(1000)
  })

  it('super_admin and finance_admin see revenue across both branches (org-wide), matching reports.sales.view scoping', async () => {
    const trendSA = await buildRevenueTrend(superAdminUser, 30)
    const trendFA = await buildRevenueTrend(financeAdminUser, 30)
    const totalSA = trendSA.reduce((sum, p) => sum + p.revenue, 0)
    const totalFA = trendFA.reduce((sum, p) => sum + p.revenue, 0)
    // Independent >= bounds, not a cross-call equality check: this
    // integration suite shares one actively-mutating Firestore emulator
    // across concurrently-run test files, so two sequential org-wide
    // (unfiltered) reads a few milliseconds apart are not guaranteed to see
    // byte-identical data even within the same test — a real flake observed
    // directly during Phase 23 development (expect(totalSA).toBe(totalFA)
    // failed once in the full suite despite both queries being identical
    // code), not a hypothetical. Each bound independently proves "org-wide
    // sees at least both known branches' contribution," which is the actual
    // behavior under test; exact agreement between two sequential reads is
    // not — the same reason this project's other "super_admin sees all
    // branches" tests (branch-scoping.test.ts) use a branch-membership
    // check rather than an exact aggregate sum.
    expect(totalSA).toBeGreaterThanOrEqual(1800) // branch A's 1500 + branch B's 300
    expect(totalFA).toBeGreaterThanOrEqual(1800)
  })

  it('rejects a role without reports.sales.view', async () => {
    await expect(buildRevenueTrend(cashierUser, 30)).rejects.toThrow('Forbidden')
  })
})
