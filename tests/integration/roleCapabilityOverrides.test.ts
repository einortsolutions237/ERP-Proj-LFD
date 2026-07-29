import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { PUT as putOverride, DELETE as deleteOverride } from '@/app/api/role-capability-overrides/[role]/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('PUT/DELETE /api/role-capability-overrides/[role]', () => {
  let branchA: string
  let superAdminCookie: string
  let hrAdminCookie: string
  let superAdminUid: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Role Override Test Branch A')
    branchA = a.id
    const sa = await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-overrides@test.local' })
    superAdminCookie = sa.sessionCookie
    superAdminUid = sa.uid
    hrAdminCookie = (await seedStaff({ role: 'hr_admin', branchId: branchA, email: 'hr-overrides@test.local' })).sessionCookie
  })

  function putRequest(capabilities: unknown) {
    return new Request('http://localhost', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities }),
    })
  }

  it('a non-super_admin actor (hr_admin) gets 403 attempting to set an override, even for a role that is not itself super_admin', async () => {
    const res = await withSession(hrAdminCookie, () =>
      putOverride(putRequest(['inventory.stock.view']), { params: Promise.resolve({ role: 'branch_manager' }) })
    )
    expect(res.status).toBe(403)
  })

  it('super_admin can set an override for branch_manager, and it is persisted with complete-replacement semantics', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['accounting.pnl.view']), { params: Promise.resolve({ role: 'branch_manager' }) })
    )
    expect(res.status).toBe(200)
    const doc = await getAdminFirestore().collection('roleCapabilityOverrides').doc('branch_manager').get()
    expect(doc.data()!.capabilities).toEqual(['accounting.pnl.view'])
    expect(doc.data()!.updatedBy).toBe(superAdminUid)
  })

  it('writes a role_capability_override_change audit entry with before/after', async () => {
    const snap = await getAdminFirestore()
      .collection('auditLogs')
      .where('action', '==', 'role_capability_override_change')
      .where('targetUid', '==', null)
      .get()
    // targetUid is null (this targets a ROLE, not a specific staff uid) —
    // find the entry by actor + details.role instead.
    const entry = snap.docs.find((d) => d.data().details?.role === 'branch_manager')
    expect(entry).toBeTruthy()
    expect(entry!.data().details.after).toEqual(['accounting.pnl.view'])
  })

  it('rejects attempting to set an override for super_admin itself, even by a real super_admin actor', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['inventory.stock.view']), { params: Promise.resolve({ role: 'super_admin' }) })
    )
    expect(res.status).toBe(400)
    const doc = await getAdminFirestore().collection('roleCapabilityOverrides').doc('super_admin').get()
    expect(doc.exists).toBe(false)
  })

  it('rejects an override that includes admin.roleOverrides.manage', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['admin.roleOverrides.manage']), { params: Promise.resolve({ role: 'hr_admin' }) })
    )
    expect(res.status).toBe(400)
    const doc = await getAdminFirestore().collection('roleCapabilityOverrides').doc('hr_admin').get()
    expect(doc.exists).toBe(false)
  })

  it('rejects a request body with a non-array or unknown capability string', async () => {
    const res1 = await withSession(superAdminCookie, () =>
      putOverride(putRequest('not-an-array'), { params: Promise.resolve({ role: 'hr_admin' }) })
    )
    expect(res1.status).toBe(400)
    const res2 = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['not.a.real.capability']), { params: Promise.resolve({ role: 'hr_admin' }) })
    )
    expect(res2.status).toBe(400)
  })

  it('DELETE reverts branch_manager to the hardcoded default and writes an audit entry with after: null', async () => {
    const res = await withSession(superAdminCookie, () =>
      deleteOverride(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ role: 'branch_manager' }) })
    )
    expect(res.status).toBe(200)
    const doc = await getAdminFirestore().collection('roleCapabilityOverrides').doc('branch_manager').get()
    expect(doc.exists).toBe(false)
    const snap = await getAdminFirestore().collection('auditLogs').where('action', '==', 'role_capability_override_change').get()
    const revertEntry = snap.docs.find((d) => d.data().details?.role === 'branch_manager' && d.data().details?.after === null)
    expect(revertEntry).toBeTruthy()
  })

  it('DELETE on a role with no existing override is a harmless no-op, still 200', async () => {
    const res = await withSession(superAdminCookie, () =>
      deleteOverride(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ role: 'it_admin' }) })
    )
    expect(res.status).toBe(200)
  })

  it('a non-super_admin actor (hr_admin) gets 403 attempting DELETE, even for a role that is not itself super_admin', async () => {
    const res = await withSession(hrAdminCookie, () =>
      deleteOverride(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ role: 'it_admin' }) })
    )
    expect(res.status).toBe(403)
  })

  it('rejects DELETE for the super_admin role itself, even by a real super_admin actor', async () => {
    const res = await withSession(superAdminCookie, () =>
      deleteOverride(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ role: 'super_admin' }) })
    )
    expect(res.status).toBe(400)
  })

  it('rejects an invalid role param that is not one of the fourteen real roles', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['inventory.stock.view']), { params: Promise.resolve({ role: 'not_a_real_role' }) })
    )
    expect(res.status).toBe(400)
  })
})
