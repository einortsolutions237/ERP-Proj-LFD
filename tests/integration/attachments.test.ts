import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postAttachment } from '@/app/api/attachments/route'
import { POST as postExpense } from '@/app/api/expenses/route'
import { POST as postLabOrder } from '@/app/api/lab-orders/route'
import { POST as postLabResult } from '@/app/api/lab-results/route'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff, seedCustomer } from '../setup/fixtures'

describe('POST /api/attachments', () => {
  let branchA: string
  let financeAdminCookie: string
  let generalManagerCookie: string
  let doctorCookie: string
  let labStaffCookie: string
  let nurseCookie: string
  let expenseId: string
  let labResultId: string

  function jsonRequest(url: string, body: unknown) {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
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
    const a = await seedBranch('Attachments Test Branch A')
    branchA = a.id
    financeAdminCookie = (await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-att@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm-att@test.local' })).sessionCookie
    doctorCookie = (await seedStaff({ role: 'doctor', branchId: branchA, email: 'doc-att@test.local' })).sessionCookie
    labStaffCookie = (await seedStaff({ role: 'lab_staff', branchId: branchA, email: 'ls-att@test.local' })).sessionCookie
    nurseCookie = (await seedStaff({ role: 'nurse', branchId: branchA, email: 'nu-att@test.local' })).sessionCookie

    const expenseRes = await withSession(financeAdminCookie, () =>
      postExpense(jsonRequest('http://localhost/api/expenses', { date: '2026-07-19', category: 'Supplies', amount: 75, description: 'Gauze and gloves' }))
    )
    expenseId = (await expenseRes.json()).id

    const customer = await seedCustomer({ name: 'Attachments Test Customer', phone: '+1000000077' })
    const orderRes = await withSession(doctorCookie, () =>
      postLabOrder(jsonRequest('http://localhost/api/lab-orders', { customerId: customer.id, testName: 'CBC' }))
    )
    const labOrderId = (await orderRes.json()).id
    const resultRes = await withSession(doctorCookie, () =>
      postLabResult(jsonRequest('http://localhost/api/lab-results', { labOrderId, values: [{ parameter: 'WBC', value: '6.2', unit: 'K/uL' }] }))
    )
    labResultId = (await resultRes.json()).id
  })

  it('finance_admin uploads a PDF receipt attached to a real expense, branchId inherited from the expense', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'receipt.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(201)
    const { id } = await res.json()

    const doc = await getAdminFirestore().collection('attachments').doc(id).get()
    expect(doc.data()!.relatedCollection).toBe('expenses')
    expect(doc.data()!.relatedDocId).toBe(expenseId)
    expect(doc.data()!.fileName).toBe('receipt.pdf')
    expect(doc.data()!.mimeType).toBe('application/pdf')
    expect(doc.data()!.sizeBytes).toBe(4)
    expect(doc.data()!.branchId).toBe(branchA)

    const [exists] = await getAdminStorage().bucket().file(doc.data()!.storagePath).exists()
    expect(exists).toBe(true)

    const auditSnap = await getAdminFirestore().collection('auditLogs').where('action', '==', 'attachment_upload').where('targetUid', '==', expenseId).get()
    expect(auditSnap.empty).toBe(false)
  })

  it('doctor uploads a JPEG scan attached to a real lab result, branchId is null (labResults has no branchId field)', async () => {
    const file = new File([new Uint8Array([5, 6, 7])], 'scan.jpg', { type: 'image/jpeg' })
    const res = await withSession(doctorCookie, () => postAttachment(uploadRequest('labResults', labResultId, file)))
    expect(res.status).toBe(201)
    const { id } = await res.json()
    const doc = await getAdminFirestore().collection('attachments').doc(id).get()
    expect(doc.data()!.branchId).toBeNull()
  })

  it('lab_staff (holds clinical.lab.results.enter) can also upload a lab result attachment', async () => {
    const file = new File([new Uint8Array([9])], 'scan2.png', { type: 'image/png' })
    const res = await withSession(labStaffCookie, () => postAttachment(uploadRequest('labResults', labResultId, file)))
    expect(res.status).toBe(201)
  })

  it('general_manager can view expenses but cannot upload one — rejected 403', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(generalManagerCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(403)
  })

  it('nurse can view lab results but cannot upload one — rejected 403', async () => {
    const file = new File([new Uint8Array([1])], 'x.jpg', { type: 'image/jpeg' })
    const res = await withSession(nurseCookie, () => postAttachment(uploadRequest('labResults', labResultId, file)))
    expect(res.status).toBe(403)
  })

  it('rejects an unregistered relatedCollection with a clear 400', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('products', 'whatever', file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/relatedCollection/)
  })

  it('rejects a nonexistent relatedDocId with a clear 400', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', 'does-not-exist', file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/does not reference/)
  })

  it('rejects an unsupported file type with a clear 400', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Unsupported file type/)
  })

  it('rejects a file over the 10MB cap with a clear 400', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    const file = new File([big], 'huge.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/exceeding/)
  })

  it('rejects an unauthenticated request', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(null, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(401)
  })
})
