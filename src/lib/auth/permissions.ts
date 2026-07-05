export const ROLES = [
  'super_admin', 'admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin', 'cashier', 'doctor', 'medical_secretary',
] as const

export type RoleId = typeof ROLES[number]

// Roles whose login must go through the server-side, tamper-proof password
// verification path (Task 5's /api/auth/login) instead of the client SDK.
export const STRICT_AUDIT_ROLES: RoleId[] = ['super_admin', 'admin']

// Every future module the permission system will gate. Phase 1 only implements
// capabilities for 'admin' — the other modules are reserved so the shape exists
// without building screens ahead of scope.
export const MODULES = ['admin', 'pos', 'inventory', 'crm', 'accounting', 'hr', 'reporting', 'clinical', 'seminars'] as const

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
  | 'pos.sale.create'
  | 'pos.sale.view'
  | 'pos.sale.void'
  | 'crm.customer.create'
  | 'crm.customer.view'
  | 'crm.customer.manage'
  | 'hr.leave.request'
  | 'hr.leave.approve'
  | 'hr.attendance.self'
  | 'hr.attendance.view'
  | 'reports.sales.view'
  | 'reports.inventory.view'
  | 'clinical.record.create' | 'clinical.record.view'
  | 'clinical.appointments.manage'
  | 'seminars.attendance.view'
  // accounting.* — no capabilities defined yet;
  // add them here when the module is actually built.

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
  'pos.sale.create': 'pos',
  'pos.sale.view': 'pos',
  'pos.sale.void': 'pos',
  'crm.customer.create': 'crm',
  'crm.customer.view': 'crm',
  'crm.customer.manage': 'crm',
  'hr.leave.request': 'hr',
  'hr.leave.approve': 'hr',
  'hr.attendance.self': 'hr',
  'hr.attendance.view': 'hr',
  'reports.sales.view': 'reporting',
  'reports.inventory.view': 'reporting',
  'clinical.record.create': 'clinical',
  'clinical.record.view': 'clinical',
  'clinical.appointments.manage': 'clinical',
  'seminars.attendance.view': 'seminars',
}

const ALL_ROLES: RoleId[] = [...ROLES]
const APPROVER_ROLES: RoleId[] = ['super_admin', 'admin', 'branch_manager', 'hr_admin']

// ADMIN_HR is duplicated in firestore.rules' `staff` match (admin.staff.view) —
// Firestore rules can't import this constant, so update both together.
const ADMIN_HR: RoleId[] = ['super_admin', 'admin', 'hr_admin']
const ADMIN_ONLY: RoleId[] = ['super_admin', 'admin']
const ADMIN_BRANCH_MGR: RoleId[] = ['super_admin', 'admin', 'branch_manager']
const CASHIER_BRANCH_MGR: RoleId[] = ['super_admin', 'admin', 'branch_manager', 'cashier']
// ADMIN_IT is duplicated in firestore.rules' `auditLogs` match (admin.auditLog.view) —
// Firestore rules can't import this constant, so update both together.
const ADMIN_IT: RoleId[] = ['super_admin', 'admin', 'it_admin']
const REPORTS_ROLES: RoleId[] = ['super_admin', 'admin', 'branch_manager', 'finance_admin']
// admin is deliberately absent here — CLAUDE.md's hybrid-business/clinical-wall
// section states clinical data is walled off from admin despite admin being
// broad elsewhere. Both this and CLINICAL_VIEW_ROLES included admin from
// Phase 13 through Phase 14's Task 1 (an undetected discrepancy against that
// stated design, caught during Phase 14's Task 7 review and fixed as a
// follow-up within this phase, per explicit user decision 2026-07-05).
const CLINICAL_ROLES: RoleId[] = ['super_admin', 'doctor']
const CRM_VIEW_ROLES: RoleId[] = ['super_admin', 'admin', 'branch_manager', 'cashier', 'medical_secretary']
// Backs both clinical.record.view and clinical.appointments.manage (Phase
// 14). When general_manager ships as a real role, it must be added HERE —
// retrofitting both capabilities at once, not just one — per CLAUDE.md's
// "hybrid business" section, which says general_manager gets full clinical
// read access. Not added yet: general_manager doesn't exist in ROLES.
// admin is deliberately absent — see CLINICAL_ROLES' comment above.
const CLINICAL_VIEW_ROLES: RoleId[] = ['super_admin', 'doctor', 'medical_secretary']

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
  'pos.sale.create': CASHIER_BRANCH_MGR,
  'pos.sale.view': CASHIER_BRANCH_MGR,
  'pos.sale.void': ADMIN_BRANCH_MGR,
  'crm.customer.create': CASHIER_BRANCH_MGR,
  'crm.customer.view': CRM_VIEW_ROLES,
  'crm.customer.manage': ADMIN_BRANCH_MGR,
  'hr.leave.request': ALL_ROLES,
  'hr.leave.approve': APPROVER_ROLES,
  'hr.attendance.self': ALL_ROLES,
  'hr.attendance.view': APPROVER_ROLES,
  'reports.sales.view': REPORTS_ROLES,
  'reports.inventory.view': REPORTS_ROLES,
  'clinical.record.create': CLINICAL_ROLES,
  'clinical.record.view': CLINICAL_VIEW_ROLES,
  'clinical.appointments.manage': CLINICAL_VIEW_ROLES,
  'seminars.attendance.view': [],
}

export function hasCapability(role: RoleId, capability: Capability): boolean {
  return ROLE_CAPABILITIES[capability].includes(role)
}

export function isSuperAdmin(role: RoleId): boolean {
  return role === 'super_admin'
}

// Roles whose data access is inherently scoped to a single branch — the
// opposite of every other role, which operates org-wide. Used anywhere a
// route must decide "restrict to the caller's own branch" vs. "no
// restriction" based on role alone, rather than duplicating the same
// role check per route.
export const BRANCH_LOCKED_ROLES: RoleId[] = ['branch_manager', 'cashier']

export function isBranchLocked(role: RoleId): boolean {
  return BRANCH_LOCKED_ROLES.includes(role)
}
