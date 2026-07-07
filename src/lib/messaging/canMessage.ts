import type { RoleId } from '@/lib/auth/permissions'

export interface MessagingParty {
  uid: string
  role: RoleId
  branchId: string
}

// Roles that sit inside the messaging hierarchy rather than being "generic
// staff" reaching upward toward it. it_admin/super_admin are listed here too
// because they're handled by their own unconditional rules below, not the
// staff<->branch_manager rule.
const HIERARCHY_EXEMPT_ROLES: RoleId[] = ['branch_manager', 'general_manager', 'it_admin', 'super_admin']

function isGenericStaff(role: RoleId): boolean {
  return !HIERARCHY_EXEMPT_ROLES.includes(role)
}

// The one relationship check this whole phase exists to implement. Unlike
// every other permission in this app, this is NOT "does this role hold a
// capability" — it depends on BOTH parties' role and branch together, and
// must be re-evaluated fresh every time (see getMessagingParty.ts), never
// cached from when a conversation was first created.
//
// Symmetric by construction — every rule below is written both directions,
// so canMessage(a, b) === canMessage(b, a) always. `admin` is deliberately
// NOT special-cased: it falls through to isGenericStaff() like any other
// non-hierarchy role, reaching only its own branch's branch_manager, per
// this phase's explicit instruction to flag rather than carve out admin.
export function canMessage(a: MessagingParty, b: MessagingParty): boolean {
  if (a.uid === b.uid) return false
  if (a.role === 'super_admin' || b.role === 'super_admin') return true
  if (a.role === 'it_admin' || b.role === 'it_admin') return true
  if (isGenericStaff(a.role) && b.role === 'branch_manager' && a.branchId === b.branchId) return true
  if (isGenericStaff(b.role) && a.role === 'branch_manager' && b.branchId === a.branchId) return true
  if (a.role === 'branch_manager' && b.role === 'general_manager') return true
  if (b.role === 'branch_manager' && a.role === 'general_manager') return true
  return false
}
