import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { requireCapability } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('getSessionUser / requireCapability — role capability override resolution', () => {
  let branchA: string
  let branchManagerCookie: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Override Resolution Test Branch A')
    branchA = a.id
    branchManagerCookie = (await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'bm-override@test.local' })).sessionCookie
  })

  it('with no override doc for the role, requireCapability behaves exactly per the hardcoded default', async () => {
    // branch_manager holds inventory.stock.view by default, not accounting.pnl.view.
    await withSession(branchManagerCookie, async () => {
      await expect(requireCapability('inventory.stock.view')).resolves.toBeTruthy()
      await expect(requireCapability('accounting.pnl.view')).rejects.toThrow('Forbidden')
    })
  })

  it('once an override doc exists for the role, requireCapability uses it exclusively, not merged with the default', async () => {
    const db = getAdminFirestore()
    await db.collection('roleCapabilityOverrides').doc('branch_manager').set({
      role: 'branch_manager',
      capabilities: ['accounting.pnl.view'],
      updatedAt: new Date(),
      updatedBy: 'test-harness',
    })
    await withSession(branchManagerCookie, async () => {
      // Now granted, despite not being in the hardcoded default.
      await expect(requireCapability('accounting.pnl.view')).resolves.toBeTruthy()
      // And now REVOKED, despite being in the hardcoded default — proves
      // replacement semantics, not a delta merge.
      await expect(requireCapability('inventory.stock.view')).rejects.toThrow('Forbidden')
    })
    await db.collection('roleCapabilityOverrides').doc('branch_manager').delete()
  })

  it('after the override doc is deleted, behavior reverts to the hardcoded default on the very next request — no staleness window', async () => {
    await withSession(branchManagerCookie, async () => {
      await expect(requireCapability('inventory.stock.view')).resolves.toBeTruthy()
      await expect(requireCapability('accounting.pnl.view')).rejects.toThrow('Forbidden')
    })
  })

  it('a super_admin account is never affected by any override doc, even one manually written for the super_admin role', async () => {
    const db = getAdminFirestore()
    await db.collection('roleCapabilityOverrides').doc('super_admin').set({
      role: 'super_admin',
      capabilities: [], // maximally hostile: an override that would strip everything
      updatedAt: new Date(),
      updatedBy: 'test-harness',
    })
    const superAdminCookie = (await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-override@test.local' })).sessionCookie
    await withSession(superAdminCookie, async () => {
      // Still holds everything — the resolve path must ignore this doc for super_admin.
      await expect(requireCapability('admin.roleOverrides.manage')).resolves.toBeTruthy()
      await expect(requireCapability('accounting.pnl.view')).resolves.toBeTruthy()
    })
    await db.collection('roleCapabilityOverrides').doc('super_admin').delete()
  })

  it('a hand-written override doc granting admin.roleOverrides.manage to a non-super_admin role never actually grants it', async () => {
    const db = getAdminFirestore()
    await db.collection('roleCapabilityOverrides').doc('hr_admin').set({
      role: 'hr_admin',
      capabilities: ['admin.roleOverrides.manage', 'inventory.stock.view'],
      updatedAt: new Date(),
      updatedBy: 'test-harness',
    })
    const hrAdminCookie = (await seedStaff({ role: 'hr_admin', branchId: branchA, email: 'hr-hostile-override@test.local' })).sessionCookie
    await withSession(hrAdminCookie, async () => {
      await expect(requireCapability('admin.roleOverrides.manage')).rejects.toThrow('Forbidden')
      // The rest of the hostile doc's grant is still honored — this proves
      // the filter removes only the one dangerous capability, not the whole doc.
      await expect(requireCapability('inventory.stock.view')).resolves.toBeTruthy()
    })
    await db.collection('roleCapabilityOverrides').doc('hr_admin').delete()
  })
})
