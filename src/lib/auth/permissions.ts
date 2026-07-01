export const ROLES = [
  'super_admin', 'admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin',
] as const

export type RoleId = typeof ROLES[number]

// Roles whose login must go through the server-side, tamper-proof password
// verification path (Task 5's /api/auth/login) instead of the client SDK.
export const STRICT_AUDIT_ROLES: RoleId[] = ['super_admin', 'admin']

// Every future module the permission system will gate. Phase 1 only implements
// capabilities for 'admin' — the other four are reserved so the shape exists
// without building screens ahead of scope.
export const MODULES = ['admin', 'pos', 'inventory', 'crm', 'accounting', 'hr'] as const

export type ModuleId = typeof MODULES[number]

export type Capability =
  | 'admin.staff.view' | 'admin.staff.create' | 'admin.staff.edit' | 'admin.staff.delete'
  | 'admin.roles.view' | 'admin.roles.assign'
  | 'admin.departments.manage'
  | 'admin.branches.manage'
  | 'admin.settings.manage'
  | 'admin.auditLog.view'
  | 'inventory.catalog.manage'
  | 'inventory.suppliers.manage'
  | 'inventory.stock.view'
  | 'inventory.stock.adjust'
  | 'inventory.stock.transfer'
  // pos.*, crm.*, accounting.*, hr.* — no capabilities defined yet;
  // add them here when each module is actually built.

export const CAPABILITY_MODULE: Record<Capability, ModuleId> = {
  'admin.staff.view': 'admin',
  'admin.staff.create': 'admin',
  'admin.staff.edit': 'admin',
  'admin.staff.delete': 'admin',
  'admin.roles.view': 'admin',
  'admin.roles.assign': 'admin',
  'admin.departments.manage': 'admin',
  'admin.branches.manage': 'admin',
  'admin.settings.manage': 'admin',
  'admin.auditLog.view': 'admin',
  'inventory.catalog.manage': 'inventory',
  'inventory.suppliers.manage': 'inventory',
  'inventory.stock.view': 'inventory',
  'inventory.stock.adjust': 'inventory',
  'inventory.stock.transfer': 'inventory',
}

// ADMIN_HR is duplicated in firestore.rules' `staff` match (admin.staff.view) —
// Firestore rules can't import this constant, so update both together.
const ADMIN_HR: RoleId[] = ['super_admin', 'admin', 'hr_admin']
const ADMIN_ONLY: RoleId[] = ['super_admin', 'admin']
const ADMIN_BRANCH_MGR: RoleId[] = ['super_admin', 'admin', 'branch_manager']
// ADMIN_IT is duplicated in firestore.rules' `auditLogs` match (admin.auditLog.view) —
// Firestore rules can't import this constant, so update both together.
const ADMIN_IT: RoleId[] = ['super_admin', 'admin', 'it_admin']

export const ROLE_CAPABILITIES: Record<Capability, RoleId[]> = {
  'admin.staff.view': ADMIN_HR,
  'admin.staff.create': ADMIN_HR,
  'admin.staff.edit': ADMIN_HR,
  'admin.staff.delete': ADMIN_HR,
  'admin.roles.view': ADMIN_HR,
  'admin.roles.assign': ADMIN_HR,
  'admin.departments.manage': ADMIN_BRANCH_MGR,
  'admin.branches.manage': ADMIN_ONLY,
  'admin.settings.manage': ADMIN_IT,
  'admin.auditLog.view': ADMIN_IT,
  'inventory.catalog.manage': ADMIN_ONLY,
  'inventory.suppliers.manage': ADMIN_BRANCH_MGR,
  'inventory.stock.view': ADMIN_BRANCH_MGR,
  'inventory.stock.adjust': ADMIN_BRANCH_MGR,
  'inventory.stock.transfer': ADMIN_BRANCH_MGR,
}

export function hasCapability(role: RoleId, capability: Capability): boolean {
  return ROLE_CAPABILITIES[capability].includes(role)
}

export function isSuperAdmin(role: RoleId): boolean {
  return role === 'super_admin'
}
