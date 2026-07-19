import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedStaff, seedCustomer, seedProduct, seedSale, seedPendingDelivery } from '../setup/fixtures'
import { getSaleDetail } from '@/lib/pos/getSaleDetail'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getSaleDetail', () => {
  let branchA: string
  let branchB: string
  let cashierUid: string
  let voiderUid: string
  let customerId: string
  let productId: string
  let saleId: string
  let voidedSaleId: string
  let unresolvableCashierSaleId: string

  let branchAManager: SessionUser
  let branchBManager: SessionUser
  let branchACashier: SessionUser
  let superAdmin: SessionUser
  let financeAdmin: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Sale Detail Branch A')
    const b = await seedBranch('Sale Detail Branch B')
    branchA = a.id
    branchB = b.id

    const cashier = await seedStaff({ role: 'cashier', branchId: branchA, email: 'sd-cashier@test.local' })
    cashierUid = cashier.uid
    const voider = await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'sd-voider@test.local' })
    voiderUid = voider.uid

    const customer = await seedCustomer({ name: 'Sale Detail Customer', phone: '+1000000099' })
    customerId = customer.id
    const product = await seedProduct({ name: 'Sale Detail Widget', price: 50 })
    productId = product.id

    const sale = await seedSale({
      branchId: branchA,
      total: 100,
      createdAt: new Date(),
      cashierUid,
      customerId,
      lineItems: [{ type: 'product', itemId: productId, name: 'Sale Detail Widget', unitPrice: 50, quantity: 2, lineTotal: 100 }],
      payments: [{ method: 'mtn_momo', amount: 100, reference: 'REF-123' }],
    })
    saleId = sale.id

    const voidedSale = await seedSale({
      branchId: branchA,
      total: 25,
      createdAt: new Date(),
      voidedAt: new Date(),
      voidedBy: voiderUid,
    })
    voidedSaleId = voidedSale.id

    const unresolvable = await seedSale({
      branchId: branchA,
      total: 10,
      createdAt: new Date(),
      cashierUid: 'no-such-staff-uid',
    })
    unresolvableCashierSaleId = unresolvable.id

    await seedPendingDelivery({ branchId: branchA, productId, customerId, saleId, status: 'pending' })

    branchAManager = { uid: 'sd-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    branchBManager = { uid: 'sd-bm-b', email: 'bm-b@test.local', role: 'branch_manager', branchId: branchB }
    branchACashier = { uid: 'sd-cash', email: 'cash@test.local', role: 'cashier', branchId: branchA }
    superAdmin = { uid: 'sd-sa', email: 'sa@test.local', role: 'super_admin', branchId: branchA }
    financeAdmin = { uid: 'sd-fa', email: 'fa@test.local', role: 'finance_admin', branchId: branchA }
  })

  it('resolves line items, payments, customer, branch, and cashier names', async () => {
    const detail = await getSaleDetail(saleId, branchAManager)
    expect(detail).not.toBeNull()
    expect(detail!.branchName).toBe('Sale Detail Branch A')
    expect(detail!.cashierName).toBe('Test cashier')
    expect(detail!.customerName).toBe('Sale Detail Customer')
    expect(detail!.lineItems).toHaveLength(1)
    expect(detail!.lineItems[0].lineTotal).toBe(100)
    expect(detail!.payments[0]).toMatchObject({ method: 'mtn_momo', amount: 100, reference: 'REF-123' })
    expect(detail!.voided).toBe(false)
  })

  it('includes this sale\'s pending deliveries with resolved product names', async () => {
    const detail = await getSaleDetail(saleId, branchAManager)
    expect(detail!.pendingDeliveries).toHaveLength(1)
    expect(detail!.pendingDeliveries[0].productName).toBe('Sale Detail Widget')
    expect(detail!.pendingDeliveries[0].status).toBe('pending')
  })

  it('resolves void status and voidedByName for a voided sale', async () => {
    const detail = await getSaleDetail(voidedSaleId, branchAManager)
    expect(detail!.voided).toBe(true)
    expect(detail!.voidedByName).toBe('Test branch_manager')
    expect(detail!.voidReason).toBe('test void')
  })

  it('falls back to the raw uid when a name can\'t be resolved', async () => {
    const detail = await getSaleDetail(unresolvableCashierSaleId, branchAManager)
    expect(detail!.cashierName).toBe('no-such-staff-uid')
  })

  it('branch-locked viewer from a different branch gets null (not found), not 403', async () => {
    const detail = await getSaleDetail(saleId, branchBManager)
    expect(detail).toBeNull()
  })

  it('branch-locked cashier from the same branch can view it', async () => {
    const detail = await getSaleDetail(saleId, branchACashier)
    expect(detail).not.toBeNull()
  })

  it('org-wide super_admin can view a sale from a branch that is not their own', async () => {
    const otherBranchSale = await seedSale({ branchId: branchB, total: 5, createdAt: new Date() })
    const detail = await getSaleDetail(otherBranchSale.id, superAdmin)
    expect(detail).not.toBeNull()
    expect(detail!.branchName).toBe('Sale Detail Branch B')
  })

  it('returns null for a nonexistent sale id', async () => {
    const detail = await getSaleDetail('does-not-exist', branchAManager)
    expect(detail).toBeNull()
  })

  it('rejects a role without pos.sale.view', async () => {
    await expect(getSaleDetail(saleId, financeAdmin)).rejects.toThrow('Forbidden')
  })
})
