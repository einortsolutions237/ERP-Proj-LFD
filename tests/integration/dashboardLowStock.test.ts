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
    expect(summary.totalCount).toBe(3) // 2 in branch A + 1 in branch B
  })

  it('rejects general_manager, which does not hold inventory.stock.view', async () => {
    await expect(getDashboardLowStock(generalManagerUser)).rejects.toThrow('Forbidden')
  })
})
