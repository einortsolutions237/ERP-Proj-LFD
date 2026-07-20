import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postAttachment } from '@/app/api/attachments/route'
import { POST as postExpense } from '@/app/api/expenses/route'
import { queryExpenses } from '@/lib/expenses/store'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('queryExpenses — attachments', () => {
  let financeAdminCookie: string
  let financeAdminUser: SessionUser
  let expenseIdWithAttachments: string
  let expenseIdNoAttachments: string

  function jsonRequest(url: string, body: unknown) {
    return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }

  function uploadRequest(relatedCollection: string, relatedDocId: string, file: File) {
    const form = new FormData()
    form.set('relatedCollection', relatedCollection)
    form.set('relatedDocId', relatedDocId)
    form.set('file', file)
    return new Request('http://localhost/api/attachments', { method: 'POST', body: form })
  }

  beforeAll(async () => {
    await resetEmulator()
    const branch = await seedBranch('queryExpenses Test Branch')
    const financeAdmin = await seedStaff({ role: 'finance_admin', branchId: branch.id, email: 'fa-qe@test.local' })
    financeAdminCookie = financeAdmin.sessionCookie
    financeAdminUser = { uid: financeAdmin.uid, email: 'fa-qe@test.local', role: 'finance_admin', branchId: branch.id }

    const expenseRes = await withSession(financeAdminCookie, () =>
      postExpense(jsonRequest('http://localhost/api/expenses', { date: '2026-07-20', category: 'Supplies', amount: 60, description: 'Office supplies' }))
    )
    expenseIdWithAttachments = (await expenseRes.json()).id

    const expenseRes2 = await withSession(financeAdminCookie, () =>
      postExpense(jsonRequest('http://localhost/api/expenses', { date: '2026-07-20', category: 'Rent', amount: 500, description: 'July rent' }))
    )
    expenseIdNoAttachments = (await expenseRes2.json()).id

    // Two attachments on the first expense, exercising "multiple per expense".
    const file1 = new File([new Uint8Array([1, 2])], 'receipt-front.jpg', { type: 'image/jpeg' })
    const file2 = new File([new Uint8Array([3, 4, 5])], 'receipt-back.jpg', { type: 'image/jpeg' })
    await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseIdWithAttachments, file1)))
    await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseIdWithAttachments, file2)))
  })

  it('lists multiple attachments for an expense that has them', async () => {
    const rows = await queryExpenses(financeAdminUser)
    const row = rows.find((r) => r.id === expenseIdWithAttachments)!
    expect(row.attachments).toHaveLength(2)
    const names = row.attachments.map((a) => a.fileName).sort()
    expect(names).toEqual(['receipt-back.jpg', 'receipt-front.jpg'])
    expect(row.attachments[0].mimeType).toBe('image/jpeg')
    expect(row.attachments[0].sizeBytes).toBeGreaterThan(0)
  })

  it('returns an empty attachments array for an expense with none', async () => {
    const rows = await queryExpenses(financeAdminUser)
    const row = rows.find((r) => r.id === expenseIdNoAttachments)!
    expect(row.attachments).toEqual([])
  })

  it('attachment createdAt is an ISO string, not a Firestore Timestamp', async () => {
    const rows = await queryExpenses(financeAdminUser)
    const row = rows.find((r) => r.id === expenseIdWithAttachments)!
    expect(typeof row.attachments[0].createdAt).toBe('string')
    expect(() => new Date(row.attachments[0].createdAt).toISOString()).not.toThrow()
  })
})
