import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedStaff, seedLeaveRequest } from '../setup/fixtures'
import { getPendingLeaveApprovals } from '@/lib/dashboard/pendingLeaveApprovals'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getPendingLeaveApprovals', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let hrAdminUser: SessionUser
  let cashierUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Leave Approvals Branch A')
    const b = await seedBranch('Dashboard Leave Approvals Branch B')
    branchA = a.id
    branchB = b.id
    const staffA = await seedStaff({ role: 'cashier', branchId: branchA, email: 'dashboard-leave-staff-a@test.local' })
    const staffB = await seedStaff({ role: 'cashier', branchId: branchB, email: 'dashboard-leave-staff-b@test.local' })
    branchManagerUser = { uid: 'dashboard-leave-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    hrAdminUser = { uid: 'dashboard-leave-hr', email: 'hr@test.local', role: 'hr_admin', branchId: branchA }
    cashierUser = { uid: 'dashboard-leave-cashier', email: 'cashier@test.local', role: 'cashier', branchId: branchA }

    await seedLeaveRequest({ staffId: staffA.uid, branchId: branchA, type: 'annual', status: 'pending' })
    await seedLeaveRequest({ staffId: staffA.uid, branchId: branchA, type: 'sick', status: 'approved' }) // must be excluded
    await seedLeaveRequest({ staffId: staffB.uid, branchId: branchB, type: 'unpaid', status: 'pending' })
  })

  it('branch_manager sees only their own branch\'s pending (not approved) requests', async () => {
    const rows = await getPendingLeaveApprovals(branchManagerUser)
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('annual')
  })

  it('hr_admin sees pending requests across both branches', async () => {
    const rows = await getPendingLeaveApprovals(hrAdminUser)
    // Branch-membership + >=, not an exact count: this integration suite
    // shares one Firestore emulator across concurrently-run test files, and
    // this query is org-wide (unfiltered by branch) for hr_admin — the same
    // class of cross-file pollution risk found and fixed four times in
    // Phase 23 (see that phase's completion report), applied here
    // proactively rather than waiting for it to flake.
    const typesSeen = new Set(rows.map((r) => r.type))
    expect(typesSeen.has('annual')).toBe(true)
    expect(typesSeen.has('unpaid')).toBe(true)
    expect(rows.length).toBeGreaterThanOrEqual(2)
  })

  it('rejects cashier, which does not hold hr.leave.approve', async () => {
    await expect(getPendingLeaveApprovals(cashierUser)).rejects.toThrow('Forbidden')
  })
})
