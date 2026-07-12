import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { GET as getTreatments, POST as postTreatment } from '@/app/api/treatments/route'
import { POST as postLabOrder } from '@/app/api/lab-orders/route'
import { POST as postLabResult } from '@/app/api/lab-results/route'
import { POST as postIntakeVisit } from '@/app/api/patient-intake/visits/route'
import { resetEmulator, seedBranch, seedStaff, seedCustomer } from '../setup/fixtures'

function req(url: string, body?: unknown) {
  return new Request(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('clinical wall — capability boundaries', () => {
  let branchId: string
  let nurseCookie: string
  let labStaffCookie: string
  let cashierCookie: string
  let doctorCookie: string
  let customerId: string

  beforeAll(async () => {
    await resetEmulator()
    const branch = await seedBranch('Clinical Test Branch')
    branchId = branch.id
    nurseCookie = (await seedStaff({ role: 'nurse', branchId, email: 'nurse-cw@test.local' })).sessionCookie
    labStaffCookie = (await seedStaff({ role: 'lab_staff', branchId, email: 'lab-cw@test.local' })).sessionCookie
    cashierCookie = (await seedStaff({ role: 'cashier', branchId, email: 'cashier-cw@test.local' })).sessionCookie
    doctorCookie = (await seedStaff({ role: 'doctor', branchId, email: 'doctor-cw@test.local' })).sessionCookie
    customerId = (await seedCustomer({ name: 'Patient Test', phone: '+000999888' })).id
  })

  it('nurse can record intake (clinical.intake.record) but gets 403 on POST /api/treatments (clinical.record.create)', async () => {
    const intakeRes = await withSession(nurseCookie, () =>
      postIntakeVisit(req('http://localhost/api/patient-intake/visits', { customerId, vitals: { heightCm: 170, weightKg: 70, bloodPressure: '120/80' }, answers: [] }))
    )
    expect(intakeRes.status).not.toBe(403)
    expect(intakeRes.status).not.toBe(401)

    const treatmentRes = await withSession(nurseCookie, () => postTreatment(req('http://localhost/api/treatments', { customerId, date: new Date().toISOString() })))
    expect(treatmentRes.status).toBe(403)
  })

  it('lab_staff can enter results (clinical.lab.results.enter) but gets 403 ordering (clinical.lab.order)', async () => {
    const orderRes = await withSession(labStaffCookie, () =>
      postLabOrder(req('http://localhost/api/lab-orders', { customerId, testName: 'CBC' }))
    )
    expect(orderRes.status).toBe(403)

    const resultRes = await withSession(labStaffCookie, () =>
      postLabResult(req('http://localhost/api/lab-results', { customerId, testName: 'CBC', values: [] }))
    )
    expect(resultRes.status).not.toBe(403)
    expect(resultRes.status).not.toBe(401)
  })

  it('doctor holds both clinical.lab.order and clinical.record.create — the fallback/authoring roles remain unaffected', async () => {
    const orderRes = await withSession(doctorCookie, () => postLabOrder(req('http://localhost/api/lab-orders', { customerId, testName: 'CBC' })))
    expect(orderRes.status).not.toBe(403)
    expect(orderRes.status).not.toBe(401)
  })

  it('cashier gets 403 on every clinical route', async () => {
    const getRes = await withSession(cashierCookie, () => getTreatments(req(`http://localhost/api/treatments?customerId=${customerId}`)))
    expect(getRes.status).toBe(403)

    const postTreatmentRes = await withSession(cashierCookie, () => postTreatment(req('http://localhost/api/treatments', { customerId, date: new Date().toISOString() })))
    expect(postTreatmentRes.status).toBe(403)

    const postOrderRes = await withSession(cashierCookie, () => postLabOrder(req('http://localhost/api/lab-orders', { customerId, testName: 'CBC' })))
    expect(postOrderRes.status).toBe(403)

    const postResultRes = await withSession(cashierCookie, () => postLabResult(req('http://localhost/api/lab-results', { customerId, testName: 'CBC', values: [] })))
    expect(postResultRes.status).toBe(403)

    const postIntakeRes = await withSession(cashierCookie, () =>
      postIntakeVisit(req('http://localhost/api/patient-intake/visits', { customerId, vitals: {}, answers: [] }))
    )
    expect(postIntakeRes.status).toBe(403)
  })
})
