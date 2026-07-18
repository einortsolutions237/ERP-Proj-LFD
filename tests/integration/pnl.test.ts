import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { GET as getPnl } from '@/app/api/reports/pnl/route'
import { buildSalesReport } from '@/lib/reports/sales'
import { resetEmulator, seedBranch, seedStaff, seedSale, seedExpense } from '../setup/fixtures'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('P&L report', () => {
  let branchA: string
  let branchB: string
  let financeAdminUser: SessionUser
  let financeAdminCookie: string
  let cashierCookie: string
  let adminCookie: string
  let branchManagerCookie: string

  const inRange = new Date('2026-01-15T12:00:00.000Z')
  const outOfRange = new Date('2025-12-01T12:00:00.000Z')

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('PnL Test Branch A')
    const b = await seedBranch('PnL Test Branch B')
    branchA = a.id
    branchB = b.id

    const fa = await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-pnl@test.local' })
    financeAdminCookie = fa.sessionCookie
    financeAdminUser = { uid: fa.uid, email: 'fa-pnl@test.local', role: 'finance_admin', branchId: branchA }
    cashierCookie = (await seedStaff({ role: 'cashier', branchId: branchA, email: 'cash-pnl@test.local' })).sessionCookie
    adminCookie = (await seedStaff({ role: 'admin', branchId: branchA, email: 'admin-pnl@test.local' })).sessionCookie
    branchManagerCookie = (await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'bm-pnl@test.local' })).sessionCookie

    await seedSale({ branchId: branchA, total: 1000, createdAt: inRange })
    await seedSale({ branchId: branchA, total: 500, createdAt: inRange })
    await seedSale({ branchId: branchA, total: 9999, createdAt: inRange, voidedAt: inRange })
    await seedSale({ branchId: branchA, total: 7777, createdAt: outOfRange })
    await seedSale({ branchId: branchB, total: 300, createdAt: inRange })

    await seedExpense({ branchId: branchA, date: new Date('2026-01-15T00:00:00.000Z'), category: 'Rent', amount: 300 })
    await seedExpense({ branchId: branchA, date: new Date('2026-01-15T00:00:00.000Z'), category: 'Utilities', amount: 150 })
    await seedExpense({ branchId: branchA, date: outOfRange, category: 'Rent', amount: 999 })
    await seedExpense({ branchId: branchB, date: new Date('2026-01-15T00:00:00.000Z'), category: 'Rent', amount: 50 })
  })

  function pnlRequest(query: string) {
    return new Request(`http://localhost/api/reports/pnl${query}`)
  }

  it('combines revenue (matching buildSalesReport exactly for the same branch/range) with expenses to compute net income', async () => {
    const res = await withSession(financeAdminCookie, () =>
      getPnl(pnlRequest(`?startDate=2026-01-10&endDate=2026-01-20&branchId=${branchA}`))
    )
    expect(res.status).toBe(200)
    const pnl = await res.json()

    expect(pnl.revenueTotal).toBe(1500) // 1000 + 500; voided 9999 and out-of-range 7777 excluded
    expect(pnl.expenseTotal).toBe(450) // 300 + 150; out-of-range 999 excluded
    expect(pnl.netIncome).toBe(1050)
    const rentRow = pnl.expensesByCategory.find((c: { category: string }) => c.category === 'Rent')
    const utilitiesRow = pnl.expensesByCategory.find((c: { category: string }) => c.category === 'Utilities')
    expect(rentRow.amount).toBe(300)
    expect(utilitiesRow.amount).toBe(150)

    // The exit criterion, checked literally: the same figure buildSalesReport
    // itself produces for this branch and range, not a separate
    // recomputation that could drift from it.
    const salesReport = await buildSalesReport(financeAdminUser, '2026-01-10', '2026-01-20')
    const branchARow = salesReport.byBranch.find((b) => b.branchId === branchA)
    expect(pnl.revenueTotal).toBe(branchARow!.revenue)
  })

  it('is org-wide when no branchId filter is given', async () => {
    const res = await withSession(financeAdminCookie, () =>
      getPnl(pnlRequest('?startDate=2026-01-10&endDate=2026-01-20'))
    )
    expect(res.status).toBe(200)
    const pnl = await res.json()
    // Independent >= bounds, not exact equality — this suite shares one
    // actively-mutating emulator across concurrently-run test files (see
    // CLAUDE.md's Phase 23 process note); branch A + B's known contribution
    // is a safe lower bound regardless of what else is running.
    expect(pnl.revenueTotal).toBeGreaterThanOrEqual(1800) // branchA's 1500 + branchB's 300
    expect(pnl.expenseTotal).toBeGreaterThanOrEqual(500) // branchA's 450 + branchB's 50
    expect(pnl.branchId).toBeNull()
  })

  it('rejects a non-existent branchId filter', async () => {
    const res = await withSession(financeAdminCookie, () =>
      getPnl(pnlRequest('?startDate=2026-01-10&endDate=2026-01-20&branchId=not-a-real-branch'))
    )
    expect(res.status).toBe(400)
  })

  it('cashier, admin, and branch_manager all get 403', async () => {
    for (const cookie of [cashierCookie, adminCookie, branchManagerCookie]) {
      const res = await withSession(cookie, () => getPnl(pnlRequest('?startDate=2026-01-10&endDate=2026-01-20')))
      expect(res.status).toBe(403)
    }
  })
})
