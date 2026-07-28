import { describe, it, expect } from 'vitest'
import { ROLE_CAPABILITIES, hasCapability, hasEffectiveCapability, type Capability, type RoleId } from '@/lib/auth/permissions'

describe('admin.roleOverrides.manage capability', () => {
  it('is exactly [super_admin]', () => {
    expect(ROLE_CAPABILITIES['admin.roleOverrides.manage']).toEqual(['super_admin'])
  })

  it('no other role holds it by default', () => {
    const others: RoleId[] = ['admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin', 'cashier', 'doctor', 'medical_secretary', 'protocol', 'general_manager', 'inventory_manager', 'nurse', 'lab_staff']
    for (const role of others) {
      expect(hasCapability(role, 'admin.roleOverrides.manage')).toBe(false)
    }
  })
})

describe('hasEffectiveCapability', () => {
  it('falls back to hasCapability when effectiveCapabilities is null (no override)', () => {
    const user = { role: 'branch_manager' as RoleId, effectiveCapabilities: null }
    expect(hasEffectiveCapability(user, 'inventory.stock.view')).toBe(hasCapability('branch_manager', 'inventory.stock.view'))
    expect(hasEffectiveCapability(user, 'admin.roleOverrides.manage')).toBe(false)
  })

  it('uses effectiveCapabilities exclusively when present, ignoring the hardcoded default entirely', () => {
    // branch_manager does NOT hold accounting.pnl.view by default — an
    // override can still grant it, proving the override is a full
    // replacement, not a delta merged with the default.
    expect(hasCapability('branch_manager', 'accounting.pnl.view')).toBe(false)
    const overridden = { role: 'branch_manager' as RoleId, effectiveCapabilities: ['accounting.pnl.view'] as Capability[] }
    expect(hasEffectiveCapability(overridden, 'accounting.pnl.view')).toBe(true)
    // And the override REMOVES a capability the default grants, proving
    // it's a replacement, not additive.
    expect(hasCapability('branch_manager', 'inventory.stock.view')).toBe(true)
    expect(hasEffectiveCapability(overridden, 'inventory.stock.view')).toBe(false)
  })
})

import { validateRoleCapabilityOverride, wouldRemoveEssentialOversight, ESSENTIAL_OVERSIGHT_CAPABILITIES } from '@/lib/auth/roleOverrideValidation'

describe('validateRoleCapabilityOverride', () => {
  it('rejects any attempt to edit super_admin', () => {
    const result = validateRoleCapabilityOverride('super_admin', ['admin.auditLog.view'], {})
    expect(result?.reason).toBe('super_admin_immutable')
  })

  it('rejects an override that includes admin.roleOverrides.manage, for any role', () => {
    const result = validateRoleCapabilityOverride('branch_manager', ['admin.roleOverrides.manage'], {})
    expect(result?.reason).toBe('self_referential_escalation')
  })

  it('accepts a normal, safe capability change', () => {
    const result = validateRoleCapabilityOverride('branch_manager', ['inventory.stock.view', 'accounting.pnl.view'], {})
    expect(result).toBeNull()
  })

  it('accepts stripping admin.auditLog.view from a single role, since super_admin (excluded from all overrides) always retains it', () => {
    const result = validateRoleCapabilityOverride('admin', [], {})
    expect(result).toBeNull()
  })
})

describe('wouldRemoveEssentialOversight — proof against a synthetic dataset without super_admin', () => {
  const fakeRoles = ['admin', 'it_admin'] as const
  const fakeDefaultHasCapability = (role: string, capability: Capability) =>
    capability === 'admin.auditLog.view' && (role === 'admin' || role === 'it_admin')

  it('correctly detects a genuine zero-coverage removal when the last holder loses the capability and no super_admin is present', () => {
    // it_admin's override already stripped admin.auditLog.view; now
    // admin's own change also strips it — nobody in this synthetic
    // roster holds it anymore.
    const result = wouldRemoveEssentialOversight(
      'admin',
      [],
      fakeRoles as unknown as RoleId[],
      fakeDefaultHasCapability as unknown as (role: RoleId, capability: Capability) => boolean,
      { it_admin: [] } as Partial<Record<RoleId, Capability[]>>,
      ['admin.auditLog.view']
    )
    expect(result).toBe(true)
  })

  it('correctly allows the same change when a third role still holds the capability', () => {
    const result = wouldRemoveEssentialOversight(
      'admin',
      [],
      fakeRoles as unknown as RoleId[],
      fakeDefaultHasCapability as unknown as (role: RoleId, capability: Capability) => boolean,
      {} as Partial<Record<RoleId, Capability[]>>, // it_admin keeps its default, still holds it
      ['admin.auditLog.view']
    )
    expect(result).toBe(false)
  })

  it('the real ESSENTIAL_OVERSIGHT_CAPABILITIES list is exactly [admin.auditLog.view]', () => {
    expect(ESSENTIAL_OVERSIGHT_CAPABILITIES).toEqual(['admin.auditLog.view'])
  })
})
