import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postExpense, GET as getExpenses } from '@/app/api/expenses/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('POST /api/expenses and GET /api/expenses', () => {
  let branchA: string
  let branchB: string
  let financeAdminCookie: string
  let generalManagerCookie: string
  let superAdminCookie: string
  let cashierCookie: string
  let adminCookie: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Expenses Test Branch A')
    const b = await seedBranch('Expenses Test Branch B')
    branchA = a.id
    branchB = b.id
    financeAdminCookie = (await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-exp@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm-exp@test.local' })).sessionCookie
    superAdminCookie = (await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-exp@test.local' })).sessionCookie
    cashierCookie = (await seedStaff({ role: 'cashier', branchId: branchA, email: 'cash-exp@test.local' })).sessionCookie
    adminCookie = (await seedStaff({ role: 'admin', branchId: branchA, email: 'admin-exp@test.local' })).sessionCookie
  })

  function expenseRequest(body: unknown) {
    return new Request('http://localhost/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('finance_admin can record an expense, defaulting branchId to their own branch', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 500, description: 'July rent' }))
    )
    expect(res.status).toBe(201)
    const body = await res.json()

    const doc = await getAdminFirestore().collection('expenses').doc(body.id).get()
    expect(doc.data()!.branchId).toBe(branchA)
    expect(doc.data()!.amount).toBe(500)
    expect(doc.data()!.category).toBe('Rent')
    expect(doc.data()!.recordedBy).toBeTruthy()

    const auditSnap = await getAdminFirestore().collection('auditLogs').where('action', '==', 'expense_create').where('targetUid', '==', body.id).get()
    expect(auditSnap.empty).toBe(false)
    expect(auditSnap.docs[0].data().details.amount).toBe(500)
  })

  it('finance_admin can explicitly target a different real branch', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Utilities', amount: 200, description: 'Water bill', branchId: branchB }))
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    const doc = await getAdminFirestore().collection('expenses').doc(body.id).get()
    expect(doc.data()!.branchId).toBe(branchB)
  })

  it('rejects a non-existent branchId', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 100, description: 'x', branchId: 'not-a-real-branch' }))
    )
    expect(res.status).toBe(400)
  })

  it('rejects a non-positive amount', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 0, description: 'x' }))
    )
    expect(res.status).toBe(400)
  })

  it('rejects an invalid date', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: 'not-a-date', category: 'Rent', amount: 100, description: 'x' }))
    )
    expect(res.status).toBe(400)
  })

  it('general_manager and super_admin can view but not create; cashier/admin get 403 on both', async () => {
    const resGmCreate = await withSession(generalManagerCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 100, description: 'x' }))
    )
    expect(resGmCreate.status).toBe(403)

    const resGmView = await withSession(generalManagerCookie, () => getExpenses())
    expect(resGmView.status).toBe(200)

    const resSaView = await withSession(superAdminCookie, () => getExpenses())
    expect(resSaView.status).toBe(200)

    for (const cookie of [cashierCookie, adminCookie]) {
      const resCreate = await withSession(cookie, () =>
        postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 100, description: 'x' }))
      )
      expect(resCreate.status).toBe(403)
      const resView = await withSession(cookie, () => getExpenses())
      expect(resView.status).toBe(403)
    }
  })

  it('GET /api/expenses is org-wide for finance_admin (sees both seeded branches)', async () => {
    const res = await withSession(financeAdminCookie, () => getExpenses())
    expect(res.status).toBe(200)
    const rows = await res.json()
    const branchesSeen = new Set(rows.map((r: { branchId: string }) => r.branchId))
    expect(branchesSeen.has(branchA)).toBe(true)
    expect(branchesSeen.has(branchB)).toBe(true)
  })
})
