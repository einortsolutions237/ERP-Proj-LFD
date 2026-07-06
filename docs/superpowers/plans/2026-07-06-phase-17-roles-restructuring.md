# Phase 17 — Roles Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `inventory_manager` and `general_manager` roles, and narrow `admin` to a genuinely separate "system/access administration" seat by moving the "runs the company" business-operations capabilities it currently holds to `general_manager`.

**Architecture:** This phase touches exactly two files — `src/lib/auth/permissions.ts` (all the role/capability wiring) and `firestore.rules` (one collection's role list, which duplicates a `permissions.ts` constant because Firestore rules can't import TypeScript). No new collections, no new UI, no new API routes — every existing route/page/component that gates on `hasCapability(role, X)` picks up the new grant automatically, which is the entire point of this app's capability-based design (confirmed: no hardcoded `role === 'admin'` literals exist anywhere outside `permissions.ts` and the one Firestore rule). The risk in this phase is entirely in getting the *capability reassignment* right, not in writing new code.

**Tech Stack:** Same as the rest of the app — TypeScript, Firestore custom claims, Firestore security rules. No unit test suite in this project (confirmed convention) — verification is `npx tsc --noEmit` clean plus live verification against real `erp-lfd` data, which this phase's own exit criteria make mandatory, not optional.

## Global Constraints

- `admin`'s final capability set is **exactly** four items: `admin.staff.create`, `admin.roles.view`, `admin.roles.assign`, `admin.settings.manage`, `admin.auditLog.view` — "system/access administration," nothing else. (Five capabilities, four of the original "four things" as described in prose — `roles.view` travels with `roles.assign` as one workflow, see the resolved table below.)
- Every other capability `admin` currently holds either moves to `general_manager` (if it was named as "business operations": staff oversight, branches, departments, reports, leave approval, sale void authority, `inventory.catalog.manage`, seminars manage/view) or is simply removed from `admin` with nobody new added (if it was operational/day-to-day and already fully covered by `branch_manager`/`cashier`: suppliers, stock, CRM create/view/manage, POS sale create/view, seminar attendance recording).
- `inventory_manager`: branch-locked for assignment (added to `BRANCH_LOCKED_ROLES`), client-SDK login (not added to `STRICT_AUDIT_ROLES`), gets exactly `inventory.catalog.manage`, additive alongside `super_admin`/`general_manager`.
- `general_manager`: not branch-locked (org-wide, same as `admin`/`super_admin`), added to `STRICT_AUDIT_ROLES`, added to `CLINICAL_VIEW_ROLES` by reference (flows to `clinical.record.view`/`clinical.appointments.manage`/`clinical.lab.view` in one change), explicitly added to `SEMINAR_MANAGE_ROLES` and `SEMINAR_VIEW_ROLES` (not a shared reference, so both need the literal addition), **not** added to `CLINICAL_ROLES` (authoring stays `doctor`/`super_admin` only) and **not** added to `CRM_VIEW_ROLES` (explicit, considered asymmetry — see the resolved table).
- `super_admin` is unaffected — retains everything, in every constant, unchanged.
- Every other existing role (`branch_manager`, `cashier`, `doctor`, `medical_secretary`, `hr_admin`, `finance_admin`, `it_admin`, `protocol`) must keep exactly the capabilities it has today — this phase reassigns `admin`'s footprint, it does not touch anyone else's.
- `firestore.rules`' `staff` collection match duplicates whichever constant backs `admin.staff.view` (documented in both places per this project's own established practice — see the `ADMIN_HR`/`ADMIN_IT` sync comments already in `permissions.ts`). Since `admin.staff.view` moves off `admin` entirely, this rule must change too, or a `general_manager` account would pass the capability check server-side but get denied by Firestore rules on any code path that reads `staff` directly.

## Resolved capability table (approved before implementation)

Every `ROLE_CAPABILITIES` entry that currently includes `admin`, and its Phase 17 disposition:

| Capability | Old roles | New roles | Disposition |
|---|---|---|---|
| `admin.staff.create` | super_admin, admin, hr_admin | *(unchanged)* | Admin keeps — system/access |
| `admin.roles.view` | super_admin, admin, hr_admin | *(unchanged)* | Admin keeps — paired with `roles.assign`, same `/roles` page workflow |
| `admin.roles.assign` | super_admin, admin, hr_admin | *(unchanged)* | Admin keeps — system/access |
| `admin.settings.manage` | super_admin, admin, it_admin | *(unchanged)* | Admin keeps — system/access |
| `admin.auditLog.view` | super_admin, admin, it_admin | *(unchanged)* | Admin keeps — system/access |
| `admin.staff.view` | super_admin, admin, hr_admin | super_admin, general_manager, hr_admin | Admin out, GM in — "staff oversight" |
| `admin.staff.edit` | super_admin, admin, hr_admin | super_admin, general_manager, hr_admin | Admin out, GM in — "staff oversight" |
| `admin.staff.delete` | super_admin, admin, hr_admin | super_admin, general_manager, hr_admin | Admin out, GM in — "staff oversight" (distinct from account creation) |
| `admin.branches.manage` | super_admin, admin | super_admin, general_manager | Admin out, GM in — explicit |
| `admin.departments.manage` | super_admin, admin, branch_manager | super_admin, general_manager, branch_manager | Admin out, GM in — explicit |
| `inventory.catalog.manage` | super_admin, admin | super_admin, general_manager, inventory_manager | Admin out, GM in, `inventory_manager` additive — explicit |
| `pos.sale.void` | super_admin, admin, branch_manager | super_admin, general_manager, branch_manager | Admin out, GM in — "sale void authority" |
| `reports.sales.view` | super_admin, admin, branch_manager, finance_admin | super_admin, general_manager, branch_manager, finance_admin | Admin out, GM in — explicit |
| `reports.inventory.view` | super_admin, admin, branch_manager, finance_admin | super_admin, general_manager, branch_manager, finance_admin | Admin out, GM in — explicit |
| `hr.leave.approve` | super_admin, admin, branch_manager, hr_admin | super_admin, general_manager, branch_manager, hr_admin | Admin out, GM in — explicit |
| `hr.attendance.view` | super_admin, admin, branch_manager, hr_admin | super_admin, general_manager, branch_manager, hr_admin | Admin out, GM in — travels with `leave.approve`, same HR-oversight umbrella |
| `seminars.manage` | super_admin, admin, medical_secretary | super_admin, general_manager, medical_secretary | Admin out, GM in — explicit |
| `seminars.attendance.view` | super_admin, admin, doctor, medical_secretary, protocol | super_admin, general_manager, doctor, medical_secretary, protocol | Admin out, GM in — explicit |
| `inventory.suppliers.manage` | super_admin, admin, branch_manager | super_admin, branch_manager | Admin out, **GM not added** — operational, already covered by branch_manager |
| `inventory.stock.view` | super_admin, admin, branch_manager | super_admin, branch_manager | Admin out, GM not added — operational |
| `inventory.stock.adjust` | super_admin, admin, branch_manager | super_admin, branch_manager | Admin out, GM not added — operational |
| `inventory.stock.transfer` | super_admin, admin, branch_manager | super_admin, branch_manager | Admin out, GM not added — operational |
| `crm.customer.manage` | super_admin, admin, branch_manager | super_admin, branch_manager | Admin out, GM not added — operational |
| `pos.sale.create` | super_admin, admin, branch_manager, cashier | super_admin, branch_manager, cashier | Admin out, GM not added — frontline operational |
| `pos.sale.view` | super_admin, admin, branch_manager, cashier | super_admin, branch_manager, cashier | Admin out, GM not added — frontline operational |
| `crm.customer.create` | super_admin, admin, branch_manager, cashier | super_admin, branch_manager, cashier | Admin out, GM not added — frontline operational |
| `crm.customer.view` | super_admin, admin, branch_manager, cashier, medical_secretary | super_admin, branch_manager, cashier, medical_secretary | Admin out, **GM deliberately not added** — considered asymmetry against GM's full clinical read, confirmed not a gap |
| `seminars.attendance.record` | super_admin, admin, protocol | super_admin, protocol | Admin out, GM not added — never named, stays protocol's operational job |

**Clinical** (by reference, one change flows to three capabilities): `CLINICAL_VIEW_ROLES` gains `general_manager` → backs `clinical.record.view`, `clinical.appointments.manage`, `clinical.lab.view`. `CLINICAL_ROLES` (authoring: `clinical.record.create`, `clinical.lab.manage`) is untouched.

## Structural change: which shared constants split

`ADMIN_HR` (6 capabilities) splits into `ADMIN_HR` (keeps `staff.create`/`roles.view`/`roles.assign`) and a new `GENERAL_MANAGER_HR` (`staff.view`/`staff.edit`/`staff.delete`).

`ADMIN_ONLY` (2 capabilities, `branches.manage` + `catalog.manage`) splits into `GENERAL_MANAGER_ONLY` (`branches.manage`) and a new `CATALOG_MANAGE_ROLES` (`catalog.manage`, since `inventory_manager` needs the latter but not the former).

`ADMIN_BRANCH_MGR` (7 capabilities) splits into `GENERAL_MANAGER_BRANCH_MGR` (`departments.manage`, `pos.sale.void`) and a renamed `BRANCH_MANAGER_ONLY` (the remaining 5: `suppliers.manage`, `stock.view`/`adjust`/`transfer`, `crm.customer.manage` — admin simply removed, name changed because "ADMIN_BRANCH_MGR" is no longer accurate once admin is gone).

`CASHIER_BRANCH_MGR`, `CRM_VIEW_ROLES`, `SEMINAR_RECORD_ROLES`: admin removed in place, no split needed (nothing else in these arrays changes).

`REPORTS_ROLES`, `APPROVER_ROLES`, `SEMINAR_MANAGE_ROLES`, `SEMINAR_VIEW_ROLES`: `admin` → `general_manager` swap in place, no split needed (every capability on each constant moves together).

`ADMIN_IT`, `CLINICAL_ROLES`: untouched.

---

## Task 1: Restructure `permissions.ts` — roles, capability reassignment

**Review tier: Opus** (the widest-reaching capability change since the branch-scoping fixes — every finding in this task's review must be checked against the resolved table above, not just internal consistency).

**Files:**
- Modify: `src/lib/auth/permissions.ts` (full-file replacement — nearly every line below `MODULES` changes)

**Interfaces:**
- Produces: `RoleId` now includes `'general_manager'` and `'inventory_manager'`. All `Capability` string literals are unchanged (no new capabilities, no renamed ones — only their backing role lists change). `ROLE_CAPABILITIES`, `STRICT_AUDIT_ROLES`, `BRANCH_LOCKED_ROLES` all change per the table above.

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/lib/auth/permissions.ts` with:

```ts
export const ROLES = [
  'super_admin', 'admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin', 'cashier', 'doctor', 'medical_secretary', 'protocol', 'general_manager', 'inventory_manager',
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
  | 'clinical.lab.manage' | 'clinical.lab.view'
  | 'seminars.manage'
  | 'seminars.attendance.record' | 'seminars.attendance.view'
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
  'clinical.lab.manage': 'clinical',
  'clinical.lab.view': 'clinical',
  'seminars.manage': 'seminars',
  'seminars.attendance.record': 'seminars',
  'seminars.attendance.view': 'seminars',
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
  'clinical.lab.manage': CLINICAL_ROLES,
  'clinical.lab.view': CLINICAL_VIEW_ROLES,
  'seminars.manage': SEMINAR_MANAGE_ROLES,
  'seminars.attendance.record': SEMINAR_RECORD_ROLES,
  'seminars.attendance.view': SEMINAR_VIEW_ROLES,
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
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors. (This is the strongest mechanical check available for this task — every `Record<Capability, RoleId[]>` key must still be present and every `RoleId` reference must still resolve, so a typo in a constant name or a missing capability key would fail here.)

- [ ] **Step 3: Cross-check the diff against the resolved table**

Run: `git diff src/lib/auth/permissions.ts` and manually confirm every line in the plan's "Resolved capability table" section above is reflected — this is the step a reviewer will redo independently, so doing it yourself first catches transcription errors before review.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/permissions.ts
git commit -m "feat(roles): restructure admin/general_manager split, add inventory_manager"
```

---

## Task 2: Sync `firestore.rules`' `staff` collection rule

**Review tier: Sonnet** (single, mechanical, well-defined change — but the final whole-branch review must independently re-verify this against Task 1's actual constant, not just trust it compiles).

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: the new role list backing `admin.staff.view` from Task 1 (`GENERAL_MANAGER_HR = ['super_admin', 'general_manager', 'hr_admin']`).

- [ ] **Step 1: Update the `staff` match block**

In `firestore.rules`, change:

```
    match /staff/{staffId} {
      // keep in sync with ROLE_CAPABILITIES['admin.staff.view'] (ADMIN_HR) in src/lib/auth/permissions.ts
      allow read: if request.auth != null
        && request.auth.token.branchId == resource.data.branchId
        && request.auth.token.role in ['super_admin', 'admin', 'hr_admin'];
      allow create, update, delete: if false; // all writes go through Admin SDK via /api/staff
    }
```

to:

```
    match /staff/{staffId} {
      // keep in sync with ROLE_CAPABILITIES['admin.staff.view'] (GENERAL_MANAGER_HR) in src/lib/auth/permissions.ts — moved off admin in Phase 17's roles restructuring
      allow read: if request.auth != null
        && request.auth.token.branchId == resource.data.branchId
        && request.auth.token.role in ['super_admin', 'general_manager', 'hr_admin'];
      allow create, update, delete: if false; // all writes go through Admin SDK via /api/staff
    }
```

Nothing else in this file changes — every other collection's rule is either untouched by this phase (no other rule references `admin` in a way this phase's capability changes affect) or was already fully closed (`allow read, write: if false`) and routes through the Admin SDK, which bypasses rules entirely.

- [ ] **Step 2: Verify the rules file is syntactically valid**

Run: `npx firebase deploy --only firestore:rules --dry-run` if the Firebase CLI is configured locally, otherwise visually confirm brace balance is unchanged from the pre-edit file (only the comment and the role literal inside the array changed, no structural braces added/removed).

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "fix(rules): sync staff collection's Firestore rule to GENERAL_MANAGER_HR (Phase 17)"
```

---

## Execution

Two tasks, in order (Task 2 depends on Task 1's exact constant name). **Task 1 gets Opus review** (the widest-reaching capability change this project has made); **Task 2 gets Sonnet-tier review**. Final whole-branch review also on Opus, specifically re-checking:

- Every row of the plan's "Resolved capability table" is reflected exactly in the final `ROLE_CAPABILITIES` — checked by direct side-by-side comparison, not by re-deriving the table from scratch.
- `admin`'s final capability set, read directly off `ROLE_CAPABILITIES`, is exactly `{admin.staff.create, admin.roles.view, admin.roles.assign, admin.settings.manage, admin.auditLog.view}` — no more, no less.
- Every role *other than admin/general_manager/inventory_manager* — `branch_manager`, `cashier`, `doctor`, `medical_secretary`, `hr_admin`, `finance_admin`, `it_admin`, `protocol`, `super_admin` — has the exact same capability set as before this phase, confirmed by comparing each constant's *other* members against the pre-Phase-17 file, not just confirming the admin/GM swap looks right.
- `general_manager` is in `STRICT_AUDIT_ROLES` and *not* in `BRANCH_LOCKED_ROLES`; `inventory_manager` is in `BRANCH_LOCKED_ROLES` and *not* in `STRICT_AUDIT_ROLES`.
- `CLINICAL_ROLES` (authoring) is untouched — still exactly `['super_admin', 'doctor']`, `general_manager` is not in it.
- `firestore.rules`' `staff` match exactly matches `GENERAL_MANAGER_HR`'s member list.
- No other Firestore rule needed a sync fix — confirmed by re-checking every `request.auth.token.role in [...]` literal in the file against its corresponding `ROLE_CAPABILITIES` entry (there are exactly two such literals in the whole file: `auditLogs` and `staff`; `auditLogs` backs `admin.auditLog.view`/`ADMIN_IT`, unchanged this phase).

**Live verification is mandatory, not optional, per this phase's own exit criteria** (needs the user's explicit go-ahead before writing any real data to `erp-lfd`, per this project's standing test-data policy): reassign or create a real `admin` account and a real `general_manager` account (via the existing staff role-reassignment flow or fresh creation, whichever is less disruptive to existing test fixtures). Confirm live, not just by diff:

- The `admin` account **loses** access to: reports (sales + inventory), leave approval, sale void, branch management, department management, staff view/edit/delete, seminar management/attendance-view — direct API/page checks for each, expecting 403 or the relevant UI section absent.
- The `admin` account **retains**: staff account creation (`POST /api/staff`), role assignment, settings, audit log — direct checks expecting success.
- The `general_manager` account **gains** the business-operations capabilities above, confirmed via direct API/page checks expecting success/visibility.
- The `general_manager` account's **full clinical read** is confirmed by actually opening a real patient's treatment history as that account (not just checking `hasCapability` returns true in code) — per the exit criteria's explicit requirement.
- Spot-check at least one untouched role (e.g. `branch_manager` or `cashier`) still has its full existing capability set — confirms the "every other role unchanged" requirement isn't just true in the diff but true in practice.

**Completion report** matching Phases 13-16's level of detail: commit hashes, file/line counts, the full resolved capability table reproduced with a ✅ per row confirming it landed exactly as approved, explicit confirmation of `admin`'s final 5-capability set, and the live-verification results for both the `admin` and `general_manager` accounts plus the spot-checked unaffected role.
