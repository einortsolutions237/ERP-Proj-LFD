import { describe, it, expect } from 'vitest'
import { canMessage, type MessagingParty } from '@/lib/messaging/canMessage'
import { ROLES, type RoleId } from '@/lib/auth/permissions'

const BRANCH_A = 'branch-a'
const BRANCH_B = 'branch-b'

function party(uid: string, role: RoleId, branchId: string): MessagingParty {
  return { uid, role, branchId }
}

// Expected reachability, independent of the implementation under test —
// hand-derived from CLAUDE.md's Phase 19 hierarchy description.
function expected(aRole: RoleId, bRole: RoleId, sameBranch: boolean): boolean {
  if (aRole === 'super_admin' || bRole === 'super_admin') return true
  if (aRole === 'it_admin' || bRole === 'it_admin') return true
  const hierarchyExempt: RoleId[] = ['branch_manager', 'general_manager', 'it_admin', 'super_admin']
  const aGeneric = !hierarchyExempt.includes(aRole)
  const bGeneric = !hierarchyExempt.includes(bRole)
  if (aGeneric && bRole === 'branch_manager' && sameBranch) return true
  if (bGeneric && aRole === 'branch_manager' && sameBranch) return true
  if (aRole === 'branch_manager' && bRole === 'general_manager') return true
  if (bRole === 'branch_manager' && aRole === 'general_manager') return true
  return false
}

describe('canMessage — exhaustive role-pair x branch-sameness truth table', () => {
  for (const aRole of ROLES) {
    for (const bRole of ROLES) {
      for (const sameBranch of [true, false]) {
        it(`${aRole} (${sameBranch ? 'same' : 'diff'} branch) -> ${bRole}`, () => {
          const a = party('uid-a', aRole, BRANCH_A)
          const b = party('uid-b', bRole, sameBranch ? BRANCH_A : BRANCH_B)
          expect(canMessage(a, b)).toBe(expected(aRole, bRole, sameBranch))
          expect(canMessage(b, a)).toBe(expected(aRole, bRole, sameBranch)) // symmetry
        })
      }
    }
  }

  it('self-message is always false, even for super_admin/it_admin', () => {
    const superAdmin = party('same-uid', 'super_admin', BRANCH_A)
    expect(canMessage(superAdmin, { ...superAdmin })).toBe(false)
    const itAdmin = party('same-uid-2', 'it_admin', BRANCH_A)
    expect(canMessage(itAdmin, { ...itAdmin })).toBe(false)
  })

  it('branch_manager <-> branch_manager is false, even in the same branch', () => {
    const a = party('uid-a', 'branch_manager', BRANCH_A)
    const b = party('uid-b', 'branch_manager', BRANCH_A)
    expect(canMessage(a, b)).toBe(false)
  })

  it('general_manager -> staff (cashier) is false, in any branch', () => {
    const gm = party('uid-gm', 'general_manager', BRANCH_A)
    const cashierSame = party('uid-c1', 'cashier', BRANCH_A)
    const cashierDiff = party('uid-c2', 'cashier', BRANCH_B)
    expect(canMessage(gm, cashierSame)).toBe(false)
    expect(canMessage(gm, cashierDiff)).toBe(false)
  })

  it('cross-branch staff -> branch_manager is false', () => {
    const staff = party('uid-s', 'cashier', BRANCH_A)
    const foreignManager = party('uid-m', 'branch_manager', BRANCH_B)
    expect(canMessage(staff, foreignManager)).toBe(false)
  })

  it('it_admin reaches and is reached by every other role, both directions', () => {
    const itAdmin = party('uid-it', 'it_admin', BRANCH_A)
    for (const role of ROLES) {
      if (role === 'it_admin') continue
      const other = party('uid-other', role, BRANCH_B)
      expect(canMessage(itAdmin, other)).toBe(true)
      expect(canMessage(other, itAdmin)).toBe(true)
    }
  })
})
