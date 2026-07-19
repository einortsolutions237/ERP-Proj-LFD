import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postPayroll, GET as getPayroll } from '@/app/api/payroll/route'
import { PATCH as patchStaff } from '@/app/api/staff/[staffId]/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('baseSalary on staff + POST/GET /api/payroll', () => {
  let branchA: string
  let branchB: string
  let targetStaffUid: string
  let financeAdminCookie: string
  let generalManagerCookie: string
  let hrAdminCookie: string
  let superAdminCookie: string
  let cashierCookie: string
  let adminCookie: string
  let branchManagerCookie: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Payroll Test Branch A')
    const b = await seedBranch('Payroll Test Branch B')
    branchA = a.id
    branchB = b.id

    const target = await seedStaff({ role: 'cashier', branchId: branchB, email: 'target-cashier@test.local', baseSalary: 1000 })
    targetStaffUid = target.uid

    financeAdminCookie = (await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-payroll@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm-payroll@test.local' })).sessionCookie
    hrAdminCookie = (await seedStaff({ role: 'hr_admin', branchId: branchA, email: 'hr-payroll@test.local' })).sessionCookie
    superAdminCookie = (await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-payroll@test.local' })).sessionCookie
    cashierCookie = (await seedStaff({ role: 'cashier', branchId: branchA, email: 'cash-payroll@test.local' })).sessionCookie
    adminCookie = (await seedStaff({ role: 'admin', branchId: branchA, email: 'admin-payroll@test.local' })).sessionCookie
    branchManagerCookie = (await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'bm-payroll@test.local' })).sessionCookie
  })

  function payrollRequest(body: unknown) {
    return new Request('http://localhost/api/payroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('hr_admin can edit baseSalary on a staff record via PATCH /api/staff/[staffId]', async () => {
    const res = await withSession(hrAdminCookie, () =>
      patchStaff(new Request('http://localhost', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseSalary: 1500 }) }), { params: Promise.resolve({ staffId: targetStaffUid }) })
    )
    expect(res.status).toBe(200)
    const doc = await getAdminFirestore().collection('staff').doc(targetStaffUid).get()
    expect(doc.data()!.baseSalary).toBe(1500)
  })

  it('finance_admin can record a payroll record defaulting to the staff member baseSalary, branchId derived from the staff member', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postPayroll(payrollRequest({ staffId: targetStaffUid, payPeriodStart: '2026-07-01', payPeriodEnd: '2026-07-31' }))
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    const doc = await getAdminFirestore().collection('payrollRecords').doc(body.id).get()
    expect(doc.data()!.grossAmount).toBe(1500) // updated baseSalary from the previous test
    expect(doc.data()!.branchId).toBe(branchB) // the target staff member's own branch, not financeAdmin's branchA
    expect(doc.data()!.staffId).toBe(targetStaffUid)

    const auditSnap = await getAdminFirestore().collection('auditLogs').where('action', '==', 'payroll_record_create').where('targetUid', '==', targetStaffUid).get()
    expect(auditSnap.empty).toBe(false)
  })

  it('finance_admin can override grossAmount for a partial month', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postPayroll(payrollRequest({ staffId: targetStaffUid, payPeriodStart: '2026-08-01', payPeriodEnd: '2026-08-15', grossAmount: 750, notes: 'Prorated, started mid-month' }))
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    const doc = await getAdminFirestore().collection('payrollRecords').doc(body.id).get()
    expect(doc.data()!.grossAmount).toBe(750)
    expect(doc.data()!.notes).toBe('Prorated, started mid-month')
  })

  it('rejects a staffId with no baseSalary and no explicit grossAmount', async () => {
    const noSalaryStaff = await seedStaff({ role: 'cashier', branchId: branchA, email: 'no-salary@test.local' })
    const res = await withSession(financeAdminCookie, () =>
      postPayroll(payrollRequest({ staffId: noSalaryStaff.uid, payPeriodStart: '2026-07-01', payPeriodEnd: '2026-07-31' }))
    )
    expect(res.status).toBe(400)
  })

  it('rejects payPeriodEnd before payPeriodStart', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postPayroll(payrollRequest({ staffId: targetStaffUid, payPeriodStart: '2026-07-31', payPeriodEnd: '2026-07-01' }))
    )
    expect(res.status).toBe(400)
  })

  it('rejects a non-existent staffId', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postPayroll(payrollRequest({ staffId: 'not-a-real-staff-uid', payPeriodStart: '2026-07-01', payPeriodEnd: '2026-07-31' }))
    )
    expect(res.status).toBe(400)
  })

  it('general_manager and hr_admin can view but not create; super_admin can both', async () => {
    for (const cookie of [generalManagerCookie, hrAdminCookie]) {
      const createRes = await withSession(cookie, () =>
        postPayroll(payrollRequest({ staffId: targetStaffUid, payPeriodStart: '2026-09-01', payPeriodEnd: '2026-09-30' }))
      )
      expect(createRes.status).toBe(403)
      const viewRes = await withSession(cookie, () => getPayroll())
      expect(viewRes.status).toBe(200)
    }
    const saView = await withSession(superAdminCookie, () => getPayroll())
    expect(saView.status).toBe(200)

    const saCreateRes = await withSession(superAdminCookie, () =>
      postPayroll(payrollRequest({ staffId: targetStaffUid, payPeriodStart: '2026-10-01', payPeriodEnd: '2026-10-31' }))
    )
    expect(saCreateRes.status).toBe(201)
  })

  it('admin, cashier, branch_manager all get 403 on create and view', async () => {
    for (const cookie of [adminCookie, cashierCookie, branchManagerCookie]) {
      const createRes = await withSession(cookie, () =>
        postPayroll(payrollRequest({ staffId: targetStaffUid, payPeriodStart: '2026-09-01', payPeriodEnd: '2026-09-30' }))
      )
      expect(createRes.status).toBe(403)
      const viewRes = await withSession(cookie, () => getPayroll())
      expect(viewRes.status).toBe(403)
    }
  })
})
