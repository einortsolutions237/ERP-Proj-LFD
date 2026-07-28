import { ROLES, ROLE_CAPABILITIES, hasCapability, type RoleId, type Capability } from './permissions'

// Capabilities considered "essential oversight" for Phase 39's guardrail.
// super_admin is a member of every ROLE_CAPABILITIES array (confirmed by
// direct reading of every constant in permissions.ts) and is permanently
// excluded from ever having an override — so in this app's REAL data,
// wouldRemoveEssentialOversight below can never actually return true.
// It is still implemented and tested for real, against a synthetic
// dataset that omits super_admin, to prove the algorithm is sound rather
// than asserting the scenario is untestable.
export const ESSENTIAL_OVERSIGHT_CAPABILITIES: Capability[] = ['admin.auditLog.view']

export interface RoleOverrideValidationError {
  reason: 'super_admin_immutable' | 'self_referential_escalation' | 'essential_oversight_removed'
  message: string
}

// Parameterized deliberately: allRoles/defaultHasCapability/currentOverrides
// are passed explicitly rather than read from module-level globals, so a
// unit test can exercise a genuine rejection with a hypothetical reduced
// role set — proving this rejects a real zero-coverage case, not just
// documenting that one can't occur.
export function wouldRemoveEssentialOversight(
  proposedRole: RoleId,
  proposedCapabilities: Capability[],
  allRoles: readonly RoleId[],
  defaultHasCapability: (role: RoleId, capability: Capability) => boolean,
  currentOverrides: Partial<Record<RoleId, Capability[]>>,
  essentialCapabilities: Capability[] = ESSENTIAL_OVERSIGHT_CAPABILITIES
): boolean {
  for (const capability of essentialCapabilities) {
    const stillHeldByAnyone = allRoles.some((role) => {
      const effective = role === proposedRole ? proposedCapabilities : currentOverrides[role]
      if (effective) return effective.includes(capability)
      return defaultHasCapability(role, capability)
    })
    if (!stillHeldByAnyone) return true
  }
  return false
}

// Real call site's entry point — always runs against this app's actual
// ROLES/hasCapability, so wouldRemoveEssentialOversight's essential-
// oversight branch structurally can never fire here (super_admin always
// holds every ESSENTIAL_OVERSIGHT_CAPABILITIES entry and is excluded from
// currentOverrides entirely) — the super_admin-immutable and
// self-referential-escalation checks are the two that can actually
// trigger in production.
export function validateRoleCapabilityOverride(
  role: RoleId,
  newCapabilities: Capability[],
  currentOverrides: Partial<Record<RoleId, Capability[]>>
): RoleOverrideValidationError | null {
  if (role === 'super_admin') {
    return { reason: 'super_admin_immutable', message: "super_admin's capabilities cannot be edited through this mechanism." }
  }
  if (newCapabilities.includes('admin.roleOverrides.manage')) {
    return { reason: 'self_referential_escalation', message: 'admin.roleOverrides.manage can never be granted through an override.' }
  }
  if (wouldRemoveEssentialOversight(role, newCapabilities, ROLES, hasCapability, currentOverrides)) {
    return { reason: 'essential_oversight_removed', message: 'This change would leave no role able to review the audit log.' }
  }
  return null
}
