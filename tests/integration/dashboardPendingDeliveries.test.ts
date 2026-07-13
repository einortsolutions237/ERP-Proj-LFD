import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedProduct, seedCustomer, seedPendingDelivery } from '../setup/fixtures'
import { getDashboardPendingDeliveries } from '@/lib/dashboard/pendingDeliveriesSummary'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getDashboardPendingDeliveries', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let cashierUser: SessionUser
  let generalManagerUser: SessionUser
  let hrAdminUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Pending Deliveries Branch A')
    const b = await seedBranch('Dashboard Pending Deliveries Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-pd-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    cashierUser = { uid: 'dashboard-pd-cashier', email: 'cash@test.local', role: 'cashier', branchId: branchA }
    generalManagerUser = { uid: 'dashboard-pd-gm', email: 'gm@test.local', role: 'general_manager', branchId: branchA }
    hrAdminUser = { uid: 'dashboard-pd-hr', email: 'hr@test.local', role: 'hr_admin', branchId: branchA }

    const product = await seedProduct({ name: 'Backordered Widget', price: 100 })
    const customer = await seedCustomer({ name: 'Test Customer', phone: '+1000000001' })

    await seedPendingDelivery({ branchId: branchA, productId: product.id, customerId: customer.id, saleId: 'sale-1', status: 'pending' })
    await seedPendingDelivery({ branchId: branchA, productId: product.id, customerId: customer.id, saleId: 'sale-2', status: 'fulfilled' }) // must be excluded
    await seedPendingDelivery({ branchId: branchB, productId: product.id, customerId: customer.id, saleId: 'sale-3', status: 'pending' })
  })

  it('branch_manager and cashier see only their own branch\'s pending (not fulfilled) deliveries', async () => {
    const summaryBM = await getDashboardPendingDeliveries(branchManagerUser)
    const summaryCashier = await getDashboardPendingDeliveries(cashierUser)
    expect(summaryBM.totalCount).toBe(1)
    expect(summaryCashier.totalCount).toBe(1)
    expect(summaryBM.rows[0].productName).toBe('Backordered Widget')
  })

  it('general_manager sees pending deliveries across both branches', async () => {
    const summary = await getDashboardPendingDeliveries(generalManagerUser)
    expect(summary.totalCount).toBe(2)
  })

  it('rejects hr_admin, which does not hold pos.delivery.fulfill', async () => {
    await expect(getDashboardPendingDeliveries(hrAdminUser)).rejects.toThrow('Forbidden')
  })
})
