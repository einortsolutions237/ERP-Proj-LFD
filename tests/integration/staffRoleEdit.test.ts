import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { PATCH as patchStaff } from '@/app/api/staff/[staffId]/route'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('PATCH /api/staff/[staffId] — super_admin protection guard checks the actor, not just the target', () => {
  let branchA: string
  let superAdminActorCookie: string
  let hrAdminCookie: string
  let generalManagerCookie: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Role Edit Test Branch A')
    branchA = a.id

    superAdminActorCookie = (await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-actor@test.local' })).sessionCookie
    hrAdminCookie = (await seedStaff({ role: 'hr_admin', branchId: branchA, email: 'hr-roleedit@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm-roleedit@test.local' })).sessionCookie
  })

  function editRequest(body: unknown) {
    return new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('a super_admin actor can change another super_admin-tagged account\'s role', async () => {
    const target = await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-target-1@test.local' })
    const res = await withSession(superAdminActorCookie, () =>
      patchStaff(editRequest({ role: 'admin' }), { params: Promise.resolve({ staffId: target.uid }) })
    )
    expect(res.status).toBe(200)
  })

  it('a super_admin actor can deactivate another super_admin-tagged account', async () => {
    const target = await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-target-2@test.local' })
    const res = await withSession(superAdminActorCookie, () =>
      patchStaff(editRequest({ employment: { status: 'inactive' } }), { params: Promise.resolve({ staffId: target.uid }) })
    )
    expect(res.status).toBe(200)
  })

  it('a non-super_admin actor (hr_admin) is still blocked from changing a super_admin-tagged account\'s role', async () => {
    const target = await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-target-3@test.local' })
    const res = await withSession(hrAdminCookie, () =>
      patchStaff(editRequest({ role: 'admin' }), { params: Promise.resolve({ staffId: target.uid }) })
    )
    expect(res.status).toBe(403)
  })

  it('a non-super_admin actor (general_manager) is still blocked from deactivating a super_admin-tagged account', async () => {
    const target = await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-target-4@test.local' })
    const res = await withSession(generalManagerCookie, () =>
      patchStaff(editRequest({ employment: { status: 'inactive' } }), { params: Promise.resolve({ staffId: target.uid }) })
    )
    expect(res.status).toBe(403)
  })

  it('assigning super_admin to a non-super_admin account through this endpoint is still rejected regardless of actor', async () => {
    const target = await seedStaff({ role: 'admin', branchId: branchA, email: 'admin-target-roleedit@test.local' })
    const res = await withSession(superAdminActorCookie, () =>
      patchStaff(editRequest({ role: 'super_admin' }), { params: Promise.resolve({ staffId: target.uid }) })
    )
    expect(res.status).toBe(403)
  })
})
