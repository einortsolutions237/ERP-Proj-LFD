import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postAttachment } from '@/app/api/attachments/route'
import { GET as getAttachment } from '@/app/api/attachments/[id]/route'
import { POST as postExpense } from '@/app/api/expenses/route'
import { POST as postLabOrder } from '@/app/api/lab-orders/route'
import { POST as postLabResult } from '@/app/api/lab-results/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff, seedCustomer } from '../setup/fixtures'

// GET /api/attachments/[id] gates on the `view` capability only — see
// src/lib/attachments/capabilityMap.ts's own comment: today, no role
// holding accounting.expense.view or clinical.lab.view is branch-locked,
// so the branch guard this task adds has no real role to exercise it
// against out of the box. To genuinely exercise the guard (not just the
// capability check that runs before it), these tests grant the view
// capability to a real branch-locked role (`branch_manager`) via the
// Phase 39 roleCapabilityOverrides mechanism — exactly the "hand an
// existing capability to a role that lacks it by default" case that
// feature was built for. This is a deliberate test-only use of that
// mechanism, not a claim about real-world default role capabilities.
describe('GET /api/attachments/[id] branch scoping', () => {
  let branchA: string
  let branchB: string
  let financeAdminCookie: string
  let branchManagerACookie: string
  let branchManagerBCookie: string
  let doctorCookie: string
  let expenseAttachmentId: string
  let labAttachmentId: string

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

  function getRequest(id: string) {
    return new Request(`http://localhost/api/attachments/${id}`)
  }

  beforeAll(async () => {
    await resetEmulator()

    // Grant branch_manager both view capabilities used by attachable
    // collections, complete-replacement per Phase 39's own semantics —
    // this test suite doesn't need branch_manager to retain any of its
    // real default capabilities, only these two, for the duration of
    // this file. Deleted in afterAll below rather than relied on being
    // wiped by a later file's resetEmulator() — not every integration
    // test file in this suite calls resetEmulator() (e.g.
    // branchLockedOverrideScoping.test.ts cleans up via afterEach
    // instead), so leaving this doc behind would be a real ordering
    // landmine for any other file that authenticates a branch_manager
    // before a full reset happens to run. Matches the established
    // cleanup pattern in tests/integration/roleOverrideResolution.test.ts.
    await getAdminFirestore()
      .collection('roleCapabilityOverrides')
      .doc('branch_manager')
      .set({ capabilities: ['accounting.expense.view', 'clinical.lab.view'] })

    const a = await seedBranch('Attachment Scoping Branch A')
    const b = await seedBranch('Attachment Scoping Branch B')
    branchA = a.id
    branchB = b.id

    financeAdminCookie = (await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-scope@test.local' })).sessionCookie
    branchManagerACookie = (await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'bm-a-scope@test.local' })).sessionCookie
    branchManagerBCookie = (await seedStaff({ role: 'branch_manager', branchId: branchB, email: 'bm-b-scope@test.local' })).sessionCookie
    doctorCookie = (await seedStaff({ role: 'doctor', branchId: branchA, email: 'doc-scope@test.local' })).sessionCookie

    const expenseRes = await withSession(financeAdminCookie, () =>
      postExpense(jsonRequest('http://localhost/api/expenses', { date: '2026-07-19', category: 'Supplies', amount: 60, description: 'Branch-scoping test expense' }))
    )
    const expenseId = (await expenseRes.json()).id
    // Real "%PDF-" magic bytes — required by this same task's sniff check.
    const expenseFile = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'receipt.pdf', { type: 'application/pdf' })
    const uploadExpenseRes = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, expenseFile)))
    expenseAttachmentId = (await uploadExpenseRes.json()).id

    // labResults has no branchId field at all — its attachments always
    // get branchId: null, regardless of which branch the ordering doctor
    // is staffed at. Used below to confirm the null-branchId case stays
    // visible to any branch-locked viewer holding the view capability.
    const customer = await seedCustomer({ name: 'Branch Scoping Customer', phone: '+1000000099' })
    const orderRes = await withSession(doctorCookie, () => postLabOrder(jsonRequest('http://localhost/api/lab-orders', { customerId: customer.id, testName: 'CBC' })))
    const labOrderId = (await orderRes.json()).id
    const resultRes = await withSession(doctorCookie, () =>
      postLabResult(jsonRequest('http://localhost/api/lab-results', { labOrderId, values: [{ parameter: 'WBC', value: '6.2', unit: 'K/uL' }] }))
    )
    const labResultId = (await resultRes.json()).id
    // Real JPEG magic bytes — required by this same task's sniff check.
    const labFile = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'scan.jpg', { type: 'image/jpeg' })
    const uploadLabRes = await withSession(doctorCookie, () => postAttachment(uploadRequest('labResults', labResultId, labFile)))
    labAttachmentId = (await uploadLabRes.json()).id
  })

  afterAll(async () => {
    await getAdminFirestore().collection('roleCapabilityOverrides').doc('branch_manager').delete()
  })

  it("returns 404, not the file, when a branch-locked viewer requests another branch's attachment", async () => {
    const res = await withSession(branchManagerBCookie, () =>
      getAttachment(getRequest(expenseAttachmentId), { params: Promise.resolve({ id: expenseAttachmentId }) })
    )
    expect(res.status).toBe(404)
  })

  it('a branch-locked viewer in the owning branch can still retrieve the attachment (positive control)', async () => {
    const res = await withSession(branchManagerACookie, () =>
      getAttachment(getRequest(expenseAttachmentId), { params: Promise.resolve({ id: expenseAttachmentId }) })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('a non-branch-locked viewer with the view capability is unaffected by the guard regardless of branch', async () => {
    // finance_admin is not branch-locked — the guard must not apply to it
    // at all, matching the existing cross-role assertions in
    // tests/integration/attachments.test.ts.
    const res = await withSession(financeAdminCookie, () =>
      getAttachment(getRequest(expenseAttachmentId), { params: Promise.resolve({ id: expenseAttachmentId }) })
    )
    expect(res.status).toBe(200)
  })

  it('a null branchId (labResults has no branchId field) stays visible to a branch-locked viewer holding the view capability', async () => {
    const res = await withSession(branchManagerBCookie, () =>
      getAttachment(getRequest(labAttachmentId), { params: Promise.resolve({ id: labAttachmentId }) })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })
})
