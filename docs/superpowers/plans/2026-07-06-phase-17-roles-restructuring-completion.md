# Phase 17 — Roles Restructuring — Completion Report

Plan: `docs/superpowers/plans/2026-07-06-phase-17-roles-restructuring.md`
(before/after capability table produced and approved before any code changed,
per this phase's own exit criteria; executed via
`superpowers:subagent-driven-development` in a git worktree,
`.claude/worktrees/worktree-phase-17-roles-restructuring`, branch
`worktree-worktree-phase-17-roles-restructuring`.)

Base: `4e93feb` (main's tip immediately before this phase). Head: `6b36f57`.

## Commits

| # | Task | Commit | Files | Lines | Review |
|---|---|---|---|---|---|
| — | Plan doc | `9443d9c` | 1 | +429 | — |
| 1 | Restructure `permissions.ts` | `7640c13` | 1 | +106/-40 | Opus, clean — all 35 capability rows + 8 structural requirements independently re-derived and matched |
| 2 | Sync `firestore.rules` staff match | `6b36f57` | 1 | +2/-2 | Sonnet, clean — verified against actual post-Task-1 `GENERAL_MANAGER_HR` |
| — | Final whole-branch review | — | — | — | Opus, clean — 0 Critical/Important, 1 Minor informational note |

Application code total (excluding the plan doc): 2 files touched, 108 lines
added, 42 deleted, across 2 commits — the smallest file footprint of any
phase in this project, and the widest-reaching *behavioral* change since
the Phase 8 branch-scoping fixes.

## What shipped

Two new roles: `general_manager` (org-wide, `STRICT_AUDIT_ROLES`, full
business-operations authority plus full clinical read with no authoring)
and `inventory_manager` (branch-locked for assignment, client-SDK login,
exactly one capability — `inventory.catalog.manage` — whose effect is
company-wide regardless of branch, since the catalog is org-wide by
design).

`admin`'s capability footprint narrows from roughly two dozen entries down
to exactly five: `admin.staff.create`, `admin.roles.view`,
`admin.roles.assign`, `admin.settings.manage`, `admin.auditLog.view` —
"system/access administration," nothing else. Every other capability admin
held either moved to `general_manager` (the "runs the company" business
operations it was explicitly named for: staff oversight, branches,
departments, reports, leave approval, sale void authority,
`inventory.catalog.manage`, seminar management/attendance-view, plus full
clinical read via `CLINICAL_VIEW_ROLES` by reference) or was removed from
`admin` entirely with nobody new added, where the capability was
operational/day-to-day and already fully covered by `branch_manager`/
`cashier` (suppliers, stock, CRM create/view/manage, POS sale
create/view, seminar-attendance recording).

Three shared constants split into narrower ones so the swap didn't
silently move unnamed capabilities along with the named ones: `ADMIN_HR`
→ `ADMIN_HR` (admin keeps `staff.create`/`roles.*`) + `GENERAL_MANAGER_HR`
(`staff.view`/`edit`/`delete` move to GM); `ADMIN_ONLY` →
`GENERAL_MANAGER_ONLY` (`branches.manage`) + `CATALOG_MANAGE_ROLES`
(`inventory.catalog.manage`, since `inventory_manager` needs the latter
but not the former); `ADMIN_BRANCH_MGR` → `GENERAL_MANAGER_BRANCH_MGR`
(`departments.manage`/`pos.sale.void`, both named) + `BRANCH_MANAGER_ONLY`
(the remaining five operational capabilities, admin simply removed).
`CASHIER_BRANCH_MGR`, `CRM_VIEW_ROLES`, `SEMINAR_RECORD_ROLES`: admin
removed in place, nothing split. `REPORTS_ROLES`, `APPROVER_ROLES`,
`SEMINAR_MANAGE_ROLES`, `SEMINAR_VIEW_ROLES`: `admin` → `general_manager`
swap in place. `CLINICAL_VIEW_ROLES` gains `general_manager` by reference,
flowing to `clinical.record.view`/`clinical.appointments.manage`/
`clinical.lab.view` simultaneously — `CLINICAL_ROLES` (authoring) is
untouched. Three deliberate, considered asymmetries confirmed at every
review stage: `general_manager` is **not** added to `CRM_VIEW_ROLES`
(commercial/purchase-history read), **not** added to `CLINICAL_ROLES`
(clinical authoring), and **not** added to `SEMINAR_RECORD_ROLES`
(attendance recording) — none of these were named as business-operations,
and each stays with the role(s) that already held it.

One Firestore rule needed a matching sync fix: the `staff` collection's
security rule duplicated `admin.staff.view`'s backing role list (Firestore
rules can't import TypeScript constants), so it was updated from
`['super_admin', 'admin', 'hr_admin']` to
`['super_admin', 'general_manager', 'hr_admin']` to match the new
`GENERAL_MANAGER_HR` constant exactly. No other Firestore rule needed a
change — `auditLogs`' rule (backed by `ADMIN_IT`, unchanged this phase)
was confirmed untouched at both the task review and the final
whole-branch review.

Zero new UI, zero new API routes, zero new collections — every existing
route/page/component that gates on `hasCapability(role, X)` picked up the
new grants automatically, confirmed at the outset that no hardcoded
`role === 'admin'` literal exists anywhere in the codebase outside
`permissions.ts`/`firestore.rules`, and re-confirmed at the final
whole-branch review.

## The central ambiguity, and how it resolved

Before any code changed, the phase's kickoff prose ("admin narrows to
system/access administration: creating staff accounts and assigning
roles, settings, audit log") was genuinely ambiguous between two
readings: **(A)** admin's entire remaining footprint is exactly those
items, or **(B)** admin loses only the capabilities explicitly named as
business-operations and keeps everything else by default. The user chose
**Reading A (exhaustive)**. That single decision resolved every
downstream ambiguity in a consistent way: any capability not explicitly
named as business-operations lost admin's access under Reading A, and
`general_manager` gained it only when it was one of the eight named
business-operations items — otherwise nobody new was added, since
`branch_manager`/`cashier` already fully covered the operational
capabilities in question. One additional ambiguity (whether
`general_manager` should get `crm.customer.view` for parity with
`medical_secretary`'s dual-wall-spanning access) was explicitly raised and
explicitly declined — confirmed as a deliberate asymmetry, not an
oversight.

## Process notes

- **A structural entanglement caught before any code was written, not
  during review.** The kickoff's own business-operations list named 8
  capabilities, but three of the shared constants backing them
  (`ADMIN_HR`, `ADMIN_ONLY`, `ADMIN_BRANCH_MGR`) each backed *additional*
  capabilities that weren't named — editing those constants in place
  would have silently moved unnamed capabilities along with named ones.
  Surfaced explicitly in the pre-implementation table (this phase's own
  required first deliverable) rather than left for review to catch, and
  resolved by splitting the three constants before any `ROLE_CAPABILITIES`
  wiring was written.
- **A pasted "updated CLAUDE.md" reference document, mid-phase, repeated
  this project's known staleness pattern** — it listed the retired
  `lfd-erp-4713b` Firebase project ID and was internally self-contradictory
  (one paragraph described Phase 14 as "in progress," another described
  Phases 1-16 as all shipped). Flagged rather than silently reconciled or
  adopted; the user confirmed it should become the new CLAUDE.md content
  once corrected, and confirmed Reading A for the central ambiguity in the
  same exchange, so document reconciliation is captured in this
  completion pass rather than blocking implementation.
- **The live-verification dev server again started on port 3001, not
  3000** — the same leftover process from Phase 16's session was still
  occupying port 3000. Caught immediately this time by reading the
  server's own startup log before issuing the first request (a lesson
  explicitly carried forward from Phase 16's completion report), so no
  false-failure verification pass happened this time.
- **This project's "no unit test suite" convention held throughout** —
  every task's verification was `tsc --noEmit` clean plus direct,
  row-by-row confirmation of the resolved capability table against live
  source, consistent with every prior phase.

## Verification

Both tasks passed task-scoped review (spec compliance + code quality) on
the first pass — no fix-and-re-review cycle needed this phase. The final
whole-branch review re-checked all 8 items the plan's Execution section
mandates:

1. Every row of the "Resolved capability table" reflected exactly in the
   final `ROLE_CAPABILITIES` — ✅, independently re-derived by both the
   Task 1 reviewer and the final reviewer, not just cited.
2. `admin`'s final capability set is exactly the 5 named items — ✅,
   confirmed `admin` appears in no other constant.
3. Every non-restructured role (`branch_manager`, `cashier`, `doctor`,
   `medical_secretary`, `hr_admin`, `finance_admin`, `it_admin`,
   `protocol`, `super_admin`) unchanged — ✅, the two roles whose
   membership spanned a split constant (`hr_admin` across `ADMIN_HR`/
   `GENERAL_MANAGER_HR`, `branch_manager` across `GENERAL_MANAGER_BRANCH_MGR`/
   `BRANCH_MANAGER_ONLY`) were specifically traced and confirmed to retain
   their full pre-phase set across both halves.
4. `general_manager` ∈ `STRICT_AUDIT_ROLES`, ∉ `BRANCH_LOCKED_ROLES`;
   `inventory_manager` ∈ `BRANCH_LOCKED_ROLES`, ∉ `STRICT_AUDIT_ROLES` —
   ✅.
5. `CLINICAL_ROLES` (authoring) untouched, still exactly
   `['super_admin', 'doctor']` — ✅.
6. `firestore.rules`' `staff` match exactly matches `GENERAL_MANAGER_HR` —
   ✅.
7. No other Firestore rule needed a sync fix — ✅, both role literals in
   the file (`auditLogs`, `staff`) checked against their `ROLE_CAPABILITIES`
   entries.
8. No hardcoded `role === 'admin'` literal exists outside
   `permissions.ts`/`firestore.rules` — ✅, spot-checked directly against
   the live codebase at the final review, not just assumed from the
   plan's own claim.

### Live verification (real data, `erp-lfd`, per this project's standing
policy — user go-ahead obtained separately for the rules deploy and for
the live-data verification itself)

Deployed to `erp-lfd` first: the updated `firestore.rules` (no index
changes this phase). 30/30 checks passed:

- **Roles provisioned**: `test.gm@lfdservices.com` created fresh as
  `general_manager` (Auth user + staff doc + custom claims, mirroring
  `POST /api/staff`'s exact sequence, staffed at the HQ branch); passwords
  reset on the existing `test.admin@lfdservices.com` (admin) and
  `downtown.manager@lfdservices.com` (branch_manager, spot-check target)
  fixtures — new passwords handed to the user, accounts kept.
- **`admin` loses** (all confirmed `403`, and specifically confirmed
  `403` rather than `404` on routes with a nonexistent target ID, to
  prove the capability check itself is what's blocking, not a missing
  record): `GET /api/reports/sales`, `GET /api/reports/inventory`,
  `GET /api/seminars`, `PATCH /api/departments/[id]`,
  `PATCH /api/leave-requests/[id]` (approve), `PATCH /api/branches/[id]`,
  `POST /api/sales/[id]/void`, `PATCH /api/staff/[staffId]` (edit),
  `GET /api/staff` (view), `PATCH /api/products/[id]` (catalog manage).
- **`admin` keeps** (all confirmed success): `GET /api/settings` (200),
  `GET /api/audit-log` (200), `POST /api/staff` (create, 201 — a real
  temp cashier account was created by this check and deleted afterward).
- **`general_manager` gains** (all confirmed success, `404` not `403` on
  nonexistent-ID targets — proving the capability gate passes and the
  route proceeds to the not-found case): `GET /api/reports/sales` (200),
  `PATCH /api/leave-requests/[id]` (approve, 404), `GET /api/seminars`
  (200), `GET /api/staff` (view, 200), `PATCH /api/departments/[id]`
  (404), `POST /api/sales/[id]/void` (404), `PATCH /api/products/[id]`
  (catalog manage, 404).
- **`general_manager` lacks** (all confirmed `403`): `POST /api/staff`
  (create), `GET /api/settings`, `GET /api/audit-log`.
- **`general_manager`'s full clinical read**, confirmed by actually
  opening the real "Test Patient" customer's detail page as that account
  (not just a capability-map check, per the plan's explicit exit
  criterion): reached the page (`200`), saw the "Clinical record" section
  with the real treatment history, and correctly saw **no** "Add
  treatment" button — full read, no authoring, exactly as specified.
- **Spot-check: `branch_manager` unaffected**, confirmed via the real
  `downtown.manager` account: stock view still works (200), sale creation
  still reachable (400 on an intentionally-empty body, not 403), sale
  void still allowed (404 on a nonexistent ID, not 403 — `branch_manager`
  is on the `GENERAL_MANAGER_BRANCH_MGR` half of the old
  `ADMIN_BRANCH_MGR` split and correctly retained it), and
  `inventory.catalog.manage` correctly still absent (403 — `branch_manager`
  never held this capability, before or after).

Per this project's established test-data cleanup practice, the two
temporary cashier accounts created during the `admin`-staff-create check
were deleted after the checks passed. The dev server was stopped.
`test.gm@lfdservices.com` and the reset passwords for `test.admin`/
`downtown.manager` are kept as reusable fixtures, matching the pattern
already established for `test.doctor`/`test.medsec`/`test.protocol` in
prior phases.

## Known issues (updates to `docs/tech-debt.md`)

No new tech debt introduced by this phase — it's a pure capability
reassignment with no new collections, routes, or UI. One clarification
worth recording for future audits: existing Firestore `staff` documents
with `role: 'admin'` do **not** automatically become `general_manager` —
a real admin account keeps its role literal and simply has fewer
capabilities after this ships, unless explicitly reassigned via the
existing staff role-reassignment feature. This is a capability-definition
change, not a data migration, and was confirmed not to be silently
assumed otherwise anywhere in the diff at the final whole-branch review.

The standing TD-3 soft-delete/archive question (flagged in Phase 15/16's
completion reports) is untouched by this phase — this phase's own work
never touched `src/app/api/customers/[id]/route.ts`, per the project's
known-issues policy.

## Assessment

**Ready to merge: Yes.** Zero Critical/Important findings across both
tasks and the final whole-branch review — the only outstanding item
after the final review was the phase's own mandatory live-verification
gate, now complete with 30/30 checks passed. All three deliberate
asymmetries (`general_manager` excluded from `CRM_VIEW_ROLES`,
`CLINICAL_ROLES`, and `SEMINAR_RECORD_ROLES`) held under both static
review and live verification, and the two roles whose membership spanned
a split constant (`hr_admin`, `branch_manager`) were specifically proven
unchanged rather than merely assumed unchanged by the swap.
