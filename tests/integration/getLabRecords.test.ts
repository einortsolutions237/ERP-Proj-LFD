import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postAttachment } from '@/app/api/attachments/route'
import { POST as postLabOrder } from '@/app/api/lab-orders/route'
import { POST as postLabResult } from '@/app/api/lab-results/route'
import { getLabRecords } from '@/lib/clinical/getLabRecords'
import { resetEmulator, seedBranch, seedStaff, seedCustomer } from '../setup/fixtures'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getLabRecords — result id and attachments', () => {
  let doctorCookie: string
  let doctorUser: SessionUser
  let customerId: string
  let labResultId: string
  let labResultIdNoAttachments: string

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
    const branch = await seedBranch('getLabRecords Test Branch')
    const doctor = await seedStaff({ role: 'doctor', branchId: branch.id, email: 'doc-glr@test.local' })
    doctorCookie = doctor.sessionCookie
    doctorUser = { uid: doctor.uid, email: 'doc-glr@test.local', role: 'doctor', branchId: branch.id }

    const customer = await seedCustomer({ name: 'getLabRecords Test Customer', phone: '+1000000066' })
    customerId = customer.id

    const orderRes = await withSession(doctorCookie, () => postLabOrder(jsonRequest('http://localhost/api/lab-orders', { customerId, testName: 'CMP' })))
    const labOrderId = (await orderRes.json()).id
    const resultRes = await withSession(doctorCookie, () =>
      postLabResult(jsonRequest('http://localhost/api/lab-results', { labOrderId, values: [{ parameter: 'Glucose', value: '95', unit: 'mg/dL' }] }))
    )
    labResultId = (await resultRes.json()).id

    const orderRes2 = await withSession(doctorCookie, () => postLabOrder(jsonRequest('http://localhost/api/lab-orders', { customerId, testName: 'Lipid Panel' })))
    const labOrderId2 = (await orderRes2.json()).id
    const resultRes2 = await withSession(doctorCookie, () =>
      postLabResult(jsonRequest('http://localhost/api/lab-results', { labOrderId: labOrderId2, values: [{ parameter: 'LDL', value: '100', unit: 'mg/dL' }] }))
    )
    labResultIdNoAttachments = (await resultRes2.json()).id

    // Two attachments on the first result, exercising "multiple per result".
    const file1 = new File([new Uint8Array([1, 2])], 'page1.jpg', { type: 'image/jpeg' })
    const file2 = new File([new Uint8Array([3, 4, 5])], 'page2.jpg', { type: 'image/jpeg' })
    await withSession(doctorCookie, () => postAttachment(uploadRequest('labResults', labResultId, file1)))
    await withSession(doctorCookie, () => postAttachment(uploadRequest('labResults', labResultId, file2)))
  })

  it('includes the result document id', async () => {
    const rows = await getLabRecords(customerId, doctorUser)
    const withAttachments = rows.find((r) => r.result?.id === labResultId)
    expect(withAttachments).toBeDefined()
    expect(withAttachments!.result!.id).toBe(labResultId)
  })

  it('lists multiple attachments for a result that has them', async () => {
    const rows = await getLabRecords(customerId, doctorUser)
    const row = rows.find((r) => r.result?.id === labResultId)!
    expect(row.result!.attachments).toHaveLength(2)
    const names = row.result!.attachments.map((a) => a.fileName).sort()
    expect(names).toEqual(['page1.jpg', 'page2.jpg'])
    expect(row.result!.attachments[0].mimeType).toBe('image/jpeg')
    expect(row.result!.attachments[0].sizeBytes).toBeGreaterThan(0)
  })

  it('returns an empty attachments array for a result with none', async () => {
    const rows = await getLabRecords(customerId, doctorUser)
    const row = rows.find((r) => r.result?.id === labResultIdNoAttachments)!
    expect(row.result!.attachments).toEqual([])
  })

  it('leaves result as null for an order with no result at all (unchanged behavior)', async () => {
    const orderRes = await withSession(doctorCookie, () => postLabOrder(jsonRequest('http://localhost/api/lab-orders', { customerId, testName: 'Unresulted Test' })))
    const unresultedOrderId = (await orderRes.json()).id
    const rows = await getLabRecords(customerId, doctorUser)
    const row = rows.find((r) => r.id === unresultedOrderId)!
    expect(row.result).toBeNull()
  })
})
