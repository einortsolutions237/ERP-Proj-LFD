import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { GET as getSales } from '@/app/api/sales/route'
import { GET as getStaff } from '@/app/api/staff/route'
import { GET as getDepartments } from '@/app/api/departments/route'
import { GET as getStock } from '@/app/api/stock/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff, seedProduct, seedProductStock } from '../setup/fixtures'

describe('isBranchLocked read scoping', () => {
  let branchA: string
  let branchB: string
  let superAdminCookie: string
  let branchManagerACookie: string
  let cashierACookie: string
  let generalManagerCookie: string
  let hrAdminCookie: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Branch A')
    const b = await seedBranch('Branch B')
    branchA = a.id
    branchB = b.id

    superAdminCookie = (await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa@test.local' })).sessionCookie
    branchManagerACookie = (await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'bm-a@test.local' })).sessionCookie
    cashierACookie = (await seedStaff({ role: 'cashier', branchId: branchA, email: 'cashier-a@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm@test.local' })).sessionCookie
    hrAdminCookie = (await seedStaff({ role: 'hr_admin', branchId: branchA, email: 'hr@test.local' })).sessionCookie
    // The brief's original fixture set seeded every staff account in branchA,
    // leaving no staff document in branchB at all — which means the org-wide
    // "sees both branches" assertion in the staff test below could never pass
    // regardless of whether the route is correct, since there would be
    // nothing in branchB to see. Seeded here (deviation from the literal
    // brief, flagged in the task report) so that assertion is genuinely
    // exercised against real multi-branch data, matching every other section
    // (departments/sales/stock) which already seeds both branches.
    await seedStaff({ role: 'cashier', branchId: branchB, email: 'cashier-b@test.local' })

    // Departments in both branches, seeded directly (bypassing the API — this
    // suite tests reads, not the creation path).
    const db = getAdminFirestore()
    await db.collection('departments').add({ name: 'Dept A', branchId: branchA, active: true, createdAt: new Date(), updatedAt: new Date() })
    await db.collection('departments').add({ name: 'Dept B', branchId: branchB, active: true, createdAt: new Date(), updatedAt: new Date() })

    // Sales in both branches.
    await db.collection('sales').add({ branchId: branchA, lineItems: [], subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0, payments: [], cashierUid: 'x', customerId: null, clientIdempotencyKey: null, voidedAt: null, voidedBy: null, voidReason: null, createdAt: new Date() })
    await db.collection('sales').add({ branchId: branchB, lineItems: [], subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0, payments: [], cashierUid: 'x', customerId: null, clientIdempotencyKey: null, voidedAt: null, voidedBy: null, voidReason: null, createdAt: new Date() })

    // Stock in both branches.
    const product = await seedProduct({ name: 'Widget', price: 100 })
    await seedProductStock({ branchId: branchA, productId: product.id, quantity: 5 })
    await seedProductStock({ branchId: branchB, productId: product.id, quantity: 7 })
  })

  it('GET /api/sales — branch_manager and cashier see only their own branch, super_admin sees all', async () => {
    const bmRows = await (await withSession(branchManagerACookie, () => getSales())).json()
    expect(bmRows.every((r: { branchId: string }) => r.branchId === branchA)).toBe(true)
    expect(bmRows.length).toBeGreaterThan(0)

    const cashierRows = await (await withSession(cashierACookie, () => getSales())).json()
    expect(cashierRows.every((r: { branchId: string }) => r.branchId === branchA)).toBe(true)

    const superAdminRows = await (await withSession(superAdminCookie, () => getSales())).json()
    const branchesSeen = new Set(superAdminRows.map((r: { branchId: string }) => r.branchId))
    expect(branchesSeen.has(branchA)).toBe(true)
    expect(branchesSeen.has(branchB)).toBe(true)
  })

  it('GET /api/departments — branch_manager sees only their own branch, super_admin and general_manager see all', async () => {
    const bmRows = await (await withSession(branchManagerACookie, () => getDepartments())).json()
    expect(bmRows.every((r: { branchId: string }) => r.branchId === branchA)).toBe(true)
    expect(bmRows.length).toBeGreaterThan(0)

    for (const cookie of [superAdminCookie, generalManagerCookie]) {
      const rows = await (await withSession(cookie, () => getDepartments())).json()
      const branchesSeen = new Set(rows.map((r: { branchId: string }) => r.branchId))
      expect(branchesSeen.has(branchA)).toBe(true)
      expect(branchesSeen.has(branchB)).toBe(true)
    }
  })

  it('GET /api/stock — branch_manager sees only their own branch, super_admin sees all', async () => {
    const bmRows = await (await withSession(branchManagerACookie, () => getStock())).json()
    expect(bmRows.every((r: { branchId: string }) => r.branchId === branchA)).toBe(true)
    expect(bmRows.length).toBeGreaterThan(0)

    const superAdminRows = await (await withSession(superAdminCookie, () => getStock())).json()
    const branchesSeen = new Set(superAdminRows.map((r: { branchId: string }) => r.branchId))
    expect(branchesSeen.has(branchA)).toBe(true)
    expect(branchesSeen.has(branchB)).toBe(true)
  })

  it('GET /api/staff — every current holder of admin.staff.view (super_admin/general_manager/hr_admin) is org-wide, none branch-locked', async () => {
    for (const cookie of [superAdminCookie, generalManagerCookie, hrAdminCookie]) {
      const rows = await (await withSession(cookie, () => getStaff())).json()
      const branchesSeen = new Set(rows.map((r: { branchId: string }) => r.branchId))
      expect(branchesSeen.has(branchA)).toBe(true)
      expect(branchesSeen.has(branchB)).toBe(true)
    }
  })
})
