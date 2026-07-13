import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedProduct, seedProductStock } from '../setup/fixtures'
import { getDashboardLowStock } from '@/lib/dashboard/lowStockSummary'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getDashboardLowStock', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let superAdminUser: SessionUser
  let generalManagerUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Low Stock Branch A')
    const b = await seedBranch('Dashboard Low Stock Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-lowstock-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    superAdminUser = { uid: 'dashboard-lowstock-sa', email: 'sa@test.local', role: 'super_admin', branchId: branchA }
    generalManagerUser = { uid: 'dashboard-lowstock-gm', email: 'gm@test.local', role: 'general_manager', branchId: branchA }

    const lowProduct = await seedProduct({ name: 'Low Widget', price: 100, reorderThreshold: 10 })
    const boundaryProduct = await seedProduct({ name: 'Boundary Widget', price: 100, reorderThreshold: 5 })
    const okProduct = await seedProduct({ name: 'OK Widget', price: 100, reorderThreshold: 5 })

    await seedProductStock({ branchId: branchA, productId: lowProduct.id, quantity: 3 }) // 3 <= 10 -> low
    await seedProductStock({ branchId: branchA, productId: boundaryProduct.id, quantity: 5 }) // 5 <= 5 -> low (exact boundary)
    await seedProductStock({ branchId: branchA, productId: okProduct.id, quantity: 20 }) // 20 > 5 -> not low
    await seedProductStock({ branchId: branchB, productId: lowProduct.id, quantity: 1 }) // low, different branch
  })

  it('branch_manager sees only their own branch\'s low-stock rows, including the exact-boundary case', async () => {
    const summary = await getDashboardLowStock(branchManagerUser)
    expect(summary.totalCount).toBe(2)
    expect(summary.rows.map((r) => r.productName).sort()).toEqual(['Boundary Widget', 'Low Widget'])
    expect(summary.rows.every((r) => r.branchId === branchA)).toBe(true)
  })

  it('super_admin sees low-stock rows across both branches', async () => {
    const summary = await getDashboardLowStock(superAdminUser)
    // >=, not ===, and a branch-membership check rather than an exact total:
    // this integration suite shares one Firestore emulator across
    // concurrently-run test files, and seedProduct's own reorderThreshold
    // default can make another file's unrelated stock fixture newly
    // low-stock too (the same class of cross-file pollution Task 2's
    // revenueTrend org-wide test hit, and the same branch-membership idiom
    // branch-scoping.test.ts already uses for "org-wide role sees all
    // branches" assertions) — so this checks this file's own known branches
    // are represented, not that the collection contains nothing else.
    const branchesSeen = new Set(summary.rows.map((r) => r.branchId))
    expect(branchesSeen.has(branchA)).toBe(true)
    expect(branchesSeen.has(branchB)).toBe(true)
    expect(summary.totalCount).toBeGreaterThanOrEqual(3) // this file's own 2 branch-A + 1 branch-B low-stock rows
  })

  it('rejects general_manager, which does not hold inventory.stock.view', async () => {
    await expect(getDashboardLowStock(generalManagerUser)).rejects.toThrow('Forbidden')
  })
})
