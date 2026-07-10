export const ROLES = [
  'super_admin', 'admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin', 'cashier', 'doctor', 'medical_secretary', 'protocol', 'general_manager', 'inventory_manager', 'nurse', 'lab_staff',
] as const

export type RoleId = typeof ROLES[number]

// Roles whose login must go through the server-side, tamper-proof password
// verification path (Task 5's /api/auth/login) instead of the client SDK.
// general_manager added in Phase 17 — full business oversight plus full
// clinical read makes this exactly the account tier this path was built for.
export const STRICT_AUDIT_ROLES: RoleId[] = ['super_admin', 'admin', 'general_manager']

// Every future module the permission system will gate. Phase 1 only implements
// capabilities for 'admin' — the other modules are reserved so the shape exists
// without building screens ahead of scope.
export const MODULES = ['admin', 'pos', 'inventory', 'crm', 'accounting', 'hr', 'reporting', 'clinical', 'seminars', 'messaging'] as const

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
  // Phase 19.2 — split Phase 15's combined lab-management capability.
  // Two standalone lists, not composed from CLINICAL_ROLES, for the same
  // future-proofing reason clinical.intake.view had to stand alone in
  // Phase 19.1: ordering (a clinical decision) and results-entry
  // (a specialist-plus-fallback grant) are genuinely different actor sets.
  | 'clinical.lab.order' | 'clinical.lab.results.enter' | 'clinical.lab.view'
  | 'seminars.manage'
  | 'seminars.attendance.record' | 'seminars.attendance.view'
  | 'pos.delivery.fulfill'
  // Phase 19.1 — nurse & patient intake. Each of these three is backed by
  // its own standalone role list below (INTAKE_RECORD_ROLES/
  // QUESTIONNAIRE_MANAGE_ROLES/INTAKE_VIEW_ROLES), never CLINICAL_ROLES/
  // CLINICAL_VIEW_ROLES by reference — those also back clinical.record.*/
  // clinical.appointments.manage, and reusing them here would silently
  // grant nurse full diagnosis/treatment/appointment access.
  | 'clinical.intake.record'
  | 'clinical.questionnaire.manage'
  | 'clinical.intake.view'
  // Gates baseline access to the messaging feature only (i.e. "is this a
  // valid staff account"). It does NOT decide who a given sender can reach —
  // that is canMessage()'s job, re-evaluated per-recipient on every list/read/
  // send, never cached. Granted to every role because everyone has at least
  // one reachable contact (their own branch's branch_manager, at minimum, or
  // the IT support line).
  | 'messaging.access'
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
  'clinical.lab.order': 'clinical',
  'clinical.lab.results.enter': 'clinical',
  'clinical.lab.view': 'clinical',
  'seminars.manage': 'seminars',
  'seminars.attendance.record': 'seminars',
  'seminars.attendance.view': 'seminars',
  'pos.delivery.fulfill': 'pos',
  'clinical.intake.record': 'clinical',
  'clinical.questionnaire.manage': 'clinical',
  'clinical.intake.view': 'clinical',
  'messaging.access': 'messaging',
}

const ALL_ROLES: RoleId[] = [...ROLES]

// --- Phase 17 role restructuring ---
// admin's remaining footprint is EXACTLY five capabilities:
// admin.staff.create, admin.roles.view, admin.roles.assign,
// admin.settings.manage, admin.auditLog.view — "system/access
// administration," nothing else. Every other capability admin used to
// hold either moved to general_manager (the "runs the company"
// business-operations side) or, where general_manager was not explicitly
// named for it, simply lost admin's access with nobody new added
// (branch_manager/cashier/hr_admin/finance_admin/medical_secretary
// already hold those independently). See CLAUDE.md's roles-restructuring
// section and this phase's plan doc for the full resolved table.

const APPROVER_ROLES: RoleId[] = ['super_admin', 'general_manager', 'branch_manager', 'hr_admin']

// Backs admin.staff.create/admin.roles.view/admin.roles.assign only —
// admin's entire remaining staff/roles footprint. roles.view stays
// paired with roles.assign (you can't assign a role without viewing the
// role matrix first — the same /roles page UI needs both).
const ADMIN_HR: RoleId[] = ['super_admin', 'admin', 'hr_admin']
// Backs admin.staff.view/edit/delete — "staff oversight" moved to
// general_manager in Phase 17, deliberately split from admin.staff.create
// (account provisioning stays with admin; day-to-day people management
// moves to general_manager).
const GENERAL_MANAGER_HR: RoleId[] = ['super_admin', 'general_manager', 'hr_admin']

// Backs admin.branches.manage only, post-Phase-17 (was ADMIN_ONLY, which
// used to also back inventory.catalog.manage — split because
// inventory_manager needs the catalog capability but not branch
// management).
const GENERAL_MANAGER_ONLY: RoleId[] = ['super_admin', 'general_manager']
// Backs inventory.catalog.manage only. general_manager holds it as part
// of "business operations"; inventory_manager holds it as its one and
// only capability (Phase 17) — its effect is company-wide regardless of
// which branch inventory_manager is staffed at, since the catalog is
// org-wide by design.
const CATALOG_MANAGE_ROLES: RoleId[] = ['super_admin', 'general_manager', 'inventory_manager']

// Backs admin.departments.manage/pos.sale.void — the half of the former
// ADMIN_BRANCH_MGR that moved to general_manager in Phase 17
// ("departments" and "sale void authority" are both named
// business-operations items).
const GENERAL_MANAGER_BRANCH_MGR: RoleId[] = ['super_admin', 'general_manager', 'branch_manager']
// Backs inventory.suppliers.manage/inventory.stock.view/adjust/transfer/
// crm.customer.manage — the other half of the former ADMIN_BRANCH_MGR.
// These are operational, day-to-day capabilities already fully covered
// by branch_manager (per this file's own "branch_manager has full
// catalog-adjacent access" design) — none of them were named as
// business-operations in Phase 17's resolved table, so admin simply
// loses access here with nobody new added.
const BRANCH_MANAGER_ONLY: RoleId[] = ['super_admin', 'branch_manager']

// Backs pos.sale.create/pos.sale.view/crm.customer.create — admin
// removed in Phase 17 (frontline operational actions, not
// business-operations, already fully covered by branch_manager/cashier).
const CASHIER_BRANCH_MGR: RoleId[] = ['super_admin', 'branch_manager', 'cashier']
// Backs admin.settings.manage/admin.auditLog.view — admin's other two
// "system/access administration" capabilities, unchanged by Phase 17.
const ADMIN_IT: RoleId[] = ['super_admin', 'admin', 'it_admin']
const REPORTS_ROLES: RoleId[] = ['super_admin', 'general_manager', 'branch_manager', 'finance_admin']
// admin is deliberately absent here — CLAUDE.md's hybrid-business/clinical-wall
// section states clinical data is walled off from admin despite admin being
// broad elsewhere. Both this and CLINICAL_VIEW_ROLES included admin from
// Phase 13 through Phase 14's Task 1 (an undetected discrepancy against that
// stated design, caught during Phase 14's Task 7 review and fixed as a
// follow-up within this phase, per explicit user decision 2026-07-05).
const CLINICAL_ROLES: RoleId[] = ['super_admin', 'doctor']
// Backs crm.customer.view — admin removed in Phase 17 (not named as
// business-operations, already fully covered by branch_manager/cashier;
// general_manager deliberately NOT added either, despite gaining full
// clinical read via CLINICAL_VIEW_ROLES below — an explicit, considered
// asymmetry, not an oversight: general_manager oversees the business, but
// was not named as needing commercial customer-record access the way
// medical_secretary's dual-wall-spanning job requires).
const CRM_VIEW_ROLES: RoleId[] = ['super_admin', 'branch_manager', 'cashier', 'medical_secretary']
// Backs both clinical.record.view and clinical.appointments.manage (Phase
// 14) and clinical.lab.view (Phase 15). general_manager added here in
// Phase 17 (full clinical read, no authoring — CLINICAL_ROLES above is
// untouched) — one change flows to all three capabilities
// simultaneously, the same structural guarantee that's held since
// Phase 14.
// admin is deliberately absent — see CLINICAL_ROLES' comment above.
const CLINICAL_VIEW_ROLES: RoleId[] = ['super_admin', 'doctor', 'medical_secretary', 'general_manager']

// Phase 19.2 — clinical.lab.manage (Phase 15) splits into ordering vs.
// results-entry. clinical.lab.order is a standalone list, not a reference
// to CLINICAL_ROLES, even though membership currently matches — same
// future-proofing reason clinical.intake.view had to stand alone.
const LAB_ORDER_ROLES: RoleId[] = ['super_admin', 'doctor']
// doctor's inclusion here is a fallback/oversight grant, the same shape
// as doctor also holding clinical.intake.record alongside nurse — not
// the narrow single-specialist shape clinical.lab.manage used to be.
const LAB_RESULTS_ENTER_ROLES: RoleId[] = ['super_admin', 'doctor', 'lab_staff']
// clinical.lab.view can no longer be backed by CLINICAL_VIEW_ROLES by
// reference (Phase 15's original wiring) — that constant also backs
// clinical.record.view/clinical.appointments.manage, and lab_staff/nurse
// must NOT gain those. Standalone list, confirmed exact final membership
// per Phase 19.2's spec.
const LAB_VIEW_ROLES: RoleId[] = ['super_admin', 'doctor', 'medical_secretary', 'general_manager', 'lab_staff', 'nurse']

// Seminars is genuinely disjoint from the clinical wall above — protocol
// appears here but not in CLINICAL_ROLES/CLINICAL_VIEW_ROLES, and
// medical_secretary/doctor split across manage vs record in the opposite
// way they split for lab. None of these three lists may be composed from
// CLINICAL_ROLES/CLINICAL_VIEW_ROLES/CRM_VIEW_ROLES — each is spelled
// out explicitly so it can't silently inherit an unrelated role change.
// admin -> general_manager swap in Phase 17 (both explicitly named as
// business-operations); medical_secretary unaffected.
const SEMINAR_MANAGE_ROLES: RoleId[] = ['super_admin', 'general_manager', 'medical_secretary']
// admin removed in Phase 17 (never named as either bucket; recording
// stays protocol's operational job, same reasoning as medical_secretary
// not recording either); general_manager deliberately NOT added.
const SEMINAR_RECORD_ROLES: RoleId[] = ['super_admin', 'protocol']
// admin -> general_manager swap in Phase 17 (both explicitly named).
const SEMINAR_VIEW_ROLES: RoleId[] = ['super_admin', 'general_manager', 'doctor', 'medical_secretary', 'protocol']

// Backs pos.delivery.fulfill — fulfilling (or viewing) a pending delivery
// is deliberately low-trust/operational, same reasoning as why cashier
// never needed void-level scrutiny for this kind of confirmation: there's
// no way to profit from falsely marking a delivery fulfilled. admin is
// deliberately absent, consistent with Phase 17's narrowing — this is
// exactly the capability that would have needed a retrofit had Phase 18
// shipped before Phase 17's roles restructuring.
const POS_DELIVERY_FULFILL_ROLES: RoleId[] = ['super_admin', 'general_manager', 'branch_manager', 'cashier']

// Phase 19.1 — nurse & patient intake. Deliberately three separate,
// explicitly-spelled-out lists rather than composed from CLINICAL_ROLES/
// CLINICAL_VIEW_ROLES — see the Capability union's own comment above for
// why. doctor appears in both INTAKE_RECORD_ROLES and INTAKE_VIEW_ROLES:
// the doctor needs to gather or correct this data directly when the nurse
// isn't available, not just view what's already there, so this is not the
// narrow nurse-only specialist shape clinical.lab.manage has.
const INTAKE_RECORD_ROLES: RoleId[] = ['super_admin', 'doctor', 'nurse']
// admin/general_manager get this one (template configuration is a
// business-operations concern, same reasoning as seminars.manage), nurse
// gets it too since nurse is the one actually using the template day to
// day and is best placed to know when a question needs changing.
const QUESTIONNAIRE_MANAGE_ROLES: RoleId[] = ['super_admin', 'general_manager', 'admin', 'nurse']
// medical_secretary/general_manager get read access matching their
// existing clinical-view-adjacent role elsewhere; nurse does NOT get
// clinical.record.view in the other direction — confirm this holds via
// live verification, not just that this capability works.
const INTAKE_VIEW_ROLES: RoleId[] = ['super_admin', 'doctor', 'medical_secretary', 'general_manager', 'nurse']

export const ROLE_CAPABILITIES: Record<Capability, RoleId[]> = {
  'admin.staff.view': GENERAL_MANAGER_HR,
  'admin.staff.create': ADMIN_HR,
  'admin.staff.edit': GENERAL_MANAGER_HR,
  'admin.staff.delete': GENERAL_MANAGER_HR,
  'admin.roles.view': ADMIN_HR,
  'admin.roles.assign': ADMIN_HR,
  'admin.departments.manage': GENERAL_MANAGER_BRANCH_MGR,
  'admin.branches.manage': GENERAL_MANAGER_ONLY,
  'admin.settings.manage': ADMIN_IT,
  'admin.auditLog.view': ADMIN_IT,
  'inventory.catalog.manage': CATALOG_MANAGE_ROLES,
  'inventory.suppliers.manage': BRANCH_MANAGER_ONLY,
  'inventory.stock.view': BRANCH_MANAGER_ONLY,
  'inventory.stock.adjust': BRANCH_MANAGER_ONLY,
  'inventory.stock.transfer': BRANCH_MANAGER_ONLY,
  'pos.sale.create': CASHIER_BRANCH_MGR,
  'pos.sale.view': CASHIER_BRANCH_MGR,
  'pos.sale.void': GENERAL_MANAGER_BRANCH_MGR,
  'crm.customer.create': CASHIER_BRANCH_MGR,
  'crm.customer.view': CRM_VIEW_ROLES,
  'crm.customer.manage': BRANCH_MANAGER_ONLY,
  'hr.leave.request': ALL_ROLES,
  'hr.leave.approve': APPROVER_ROLES,
  'hr.attendance.self': ALL_ROLES,
  'hr.attendance.view': APPROVER_ROLES,
  'reports.sales.view': REPORTS_ROLES,
  'reports.inventory.view': REPORTS_ROLES,
  'clinical.record.create': CLINICAL_ROLES,
  'clinical.record.view': CLINICAL_VIEW_ROLES,
  'clinical.appointments.manage': CLINICAL_VIEW_ROLES,
  'clinical.lab.order': LAB_ORDER_ROLES,
  'clinical.lab.results.enter': LAB_RESULTS_ENTER_ROLES,
  'clinical.lab.view': LAB_VIEW_ROLES,
  'seminars.manage': SEMINAR_MANAGE_ROLES,
  'seminars.attendance.record': SEMINAR_RECORD_ROLES,
  'seminars.attendance.view': SEMINAR_VIEW_ROLES,
  'pos.delivery.fulfill': POS_DELIVERY_FULFILL_ROLES,
  'clinical.intake.record': INTAKE_RECORD_ROLES,
  'clinical.questionnaire.manage': QUESTIONNAIRE_MANAGE_ROLES,
  'clinical.intake.view': INTAKE_VIEW_ROLES,
  'messaging.access': ALL_ROLES,
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
// role check per route. inventory_manager added in Phase 17 — staffed at
// a specific branch for assignment purposes, same as branch_manager/
// cashier, even though inventory.catalog.manage's own effect is
// company-wide.
export const BRANCH_LOCKED_ROLES: RoleId[] = ['branch_manager', 'cashier', 'inventory_manager']

export function isBranchLocked(role: RoleId): boolean {
  return BRANCH_LOCKED_ROLES.includes(role)
}
