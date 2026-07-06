# Phase 16 — Health Seminars & Protocol — Completion Report

Plan: `docs/superpowers/plans/2026-07-05-phase-16-seminars.md`
(approved as proposed, including its seven pre-resolved sign-off decisions;
executed via `superpowers:subagent-driven-development` in a git worktree,
`.claude/worktrees/worktree-phase-16-seminars`, branch
`worktree-worktree-phase-16-seminars`.)

Base: `ed09042` (main's tip immediately before this phase). Head: `7b04a61`.

## Commits

| # | Task | Commit | Files | Lines | Review |
|---|---|---|---|---|---|
| — | Plan doc | `582daa8` | 1 | +1740 | — |
| 1 | Permissions, roles, types, audit actions | `1761c7c` | 4 | +43/-3 | Opus, clean |
| 2 | Firestore rules + composite indexes | `6085d3b` | 2 | +22 | Sonnet, clean |
| 3 | Shared `getSeminarAttendance` view/audit helper | `fb6749e` | 1 | +99 | Sonnet, clean |
| 4 | API routes (seminars + seminar-attendance) | `52b3d72` | 3 | +285 | Opus, clean |
| 5 | UI — nav, list/new/detail pages, forms | `ac0aa82` | 8 | +596/-2 | Sonnet, clean |
| 6 | Customer detail page integration | `0e038d0` | 2 | +101/-49 | Sonnet, **fix required** (see below) |
| — | Fix: `protocol` unreachable on customer page | `30386ed` | 1 | +1/-1 | Sonnet, re-reviewed clean |
| 7 | Resolve TD-3 fifth check (`seminarAttendance`) | `7b04a61` | 1 | +5 | Sonnet, clean |
| — | Final whole-branch review | — | — | — | Opus, clean (2 Minor) |

Application code total (excluding the plan doc): 22 files touched,
~1152 lines added, 55 deleted, across 9 commits.

## What shipped

A new `seminars`/`seminarAttendance` collection pair — the fourth
clinical-adjacent collection family after `treatments`, `appointments`, and
`labOrders`/`labResults`. A new `protocol` staff role. Three new
capabilities, each backed by its own explicitly-spelled-out role list (none
composed by reference from any existing constant, per the plan's Decision
#1 — the first clinical-adjacent capability set in this project's history
that is *not* a subset/superset of `CLINICAL_ROLES`/`CLINICAL_VIEW_ROLES`):

- `seminars.manage` → `SEMINAR_MANAGE_ROLES` = `['super_admin', 'admin', 'medical_secretary']`
- `seminars.attendance.record` → `SEMINAR_RECORD_ROLES` = `['super_admin', 'admin', 'protocol']`
- `seminars.attendance.view` → `SEMINAR_VIEW_ROLES` = `['super_admin', 'admin', 'doctor', 'medical_secretary', 'protocol']`

A shared `getSeminarAttendance` helper (filterable by `seminarId` or
`customerId`) is the sole audit-logged call site for viewing attendance,
writing exactly one `seminar_attendance_view` entry per call — mirroring
`getPatientTreatments`/`getAppointments`/`getLabRecords`. Seminar event
metadata (title/date/format) is deliberately **not** audit-logged, per the
plan's Decision #4 — only attendance viewing is, since the brief called out
attendance specifically as the sensitive data, not the event logistics.

No transaction was needed anywhere in this phase (unlike Phase 14's overlap
check or Phase 15's result-entry transaction) — there is no atomicity
requirement across two related documents here; the final whole-branch
review explicitly confirmed this absence is correct, not an oversight.

The customer detail page's "Seminar attendance" placeholder (in
`ClinicalSection.tsx`, dating back to Phase 13/15) is replaced with real
data, gated on a new `canViewSeminarAttendance` prop independent of
`canViewClinical` — the first time this file has needed two independent
visibility gates in the same component, since `protocol`/`admin` can see
seminar attendance without being able to see treatments. `DELETE
/api/customers/[id]` gained its fifth independent referential-integrity
check, resolving the standing question from Phase 15's completion report
(whether a fifth dependent collection would arrive before the
allowlist-shape got reconsidered — it did, and per the plan's explicit
scope boundary, this phase implemented the fifth check rather than
re-opening the soft-delete/archive question, which remains open).

## Seven pre-resolved decisions — how they held up under review

1. **Three new role-list constants, none composed by reference.** Held —
   confirmed byte-for-byte against the brief in Task 1's Opus review and
   again in the final whole-branch review.
2. **`protocol` needs zero changes to `STRICT_AUDIT_ROLES`/
   `BRANCH_LOCKED_ROLES`.** Held — both constants are unchanged in the
   diff; `protocol` logs in via the plain client-SDK path, org-wide, same
   as `doctor`/`medical_secretary`.
3. **`seminars.manage`'s `branchId` handling doesn't need `isBranchLocked()`.**
   Held — none of `medical_secretary`/`admin`/`super_admin` are
   branch-locked, so the simpler "explicit branchId, validated against a
   real branch when non-online" logic is correct as built.
4. **Audit action naming (`seminar_attendance_view`, not `seminar_view`)
   and audit scope (attendance only, not event metadata).** Held —
   confirmed live: exactly one `seminar_create`, one `seminar_edit`, two
   `seminar_attendance_record`, and five `seminar_attendance_view` entries
   were written for this run's actual call pattern, and zero
   `seminar_view`-named entries exist at all.
5. **Minimal edit support for `seminars.manage`'s "edit" half.** Held —
   `PATCH /api/seminars/[id]` plus an inline edit form, live-verified:
   `medical_secretary` successfully edited the seminar's title; `protocol`/
   `doctor` both got `403`.
6. **No Cloud Function notification this phase.** Held on reflection at
   the final whole-branch review — there's genuinely no distinct
   notification recipient for "attendance was recorded," unlike
   appointments/lab's assigned-doctor recipient.
7. **Two composite indexes for `getSeminarAttendance`'s dual filter.**
   Held — both (`seminarId`+`recordedAt`) and (`customerId`+`recordedAt`)
   deployed and exercised live without a missing-index error, the exact
   failure mode this project's own tech-debt memory flags as the
   most common live-only bug class.

## Mid-phase fix: `protocol` was unreachable on the customer detail page

Task 6's first review found a real gap the brief itself didn't anticipate:
`customers/[id]/page.tsx`'s top-level guard,
`requireAnyCapability(['crm.customer.view', 'clinical.record.view'])`,
never admitted `protocol` — so the newly-wired seminar-attendance section
was unreachable for the one role Phase 16 built it for. Fixed in `30386ed`
by adding `'seminars.attendance.view'` to that array; re-reviewed clean,
and independently re-confirmed at the final whole-branch review that every
*other* capability boolean on the page (`canManage`, `canViewCommercial`,
`canViewClinical`, `canCreateTreatment`, `canManageAppointments`,
`canViewLab`, `canManageLab`) still independently evaluates `false` for
`protocol` — the fix only changed page *reachability*, not visibility
scope. Live-verified: `protocol` now gets `200` (not a `307` redirect) on
the customer detail page and sees only the Seminar attendance subsection.

## Process notes

- **A live, reproducible instance of the "port already in use" failure
  mode.** The dev server used for live verification found port 3000
  already occupied by an unrelated leftover process and silently started
  on port 3001 instead (Next.js's own behavior, not a bug). The first
  full verification pass against port 3000 returned a wall of 404s/nulls
  — a different, stale server with none of this phase's routes. Caught
  by checking the dev server's own log output rather than trusting the
  first failing run, and re-run correctly against port 3001. Worth adding
  to this project's live-verification checklist: confirm the actual
  listening port from the server's own startup log before issuing the
  first request, don't assume 3000.
- **A heredoc-escaping artifact, not a real credential-parsing bug.**
  Ad hoc verification scripts written via a `cat > file << 'EOF'` shell
  heredoc silently collapsed `\\n` to `\n` in one script, producing a
  "Failed to parse private key" error from `firebase-admin` that looked
  like a `.env.local` problem. Isolated with a minimal reproduction
  (confirmed the regex only misbehaves through this specific heredoc
  path, not when the same file is written directly) before concluding
  the credentials themselves were fine — the same "verify the actual
  failure surface before proposing a fix" discipline this project's own
  systematic-debugging practice calls for.
- **This project's "no unit test suite" convention held throughout** —
  every task's verification was `tsc --noEmit` clean plus direct
  confirmation of imported signatures against live source, consistent
  with every prior phase.

## Verification

Every task passed its own task-scoped review (spec compliance + code
quality) before the next task began — see the table above; Task 6 required
one fix-and-re-review cycle, everything else passed first time. The final
whole-branch review re-checked all 9 items the plan's Execution section
mandates:

1. `SEMINAR_MANAGE_ROLES`/`SEMINAR_RECORD_ROLES`/`SEMINAR_VIEW_ROLES` are
   exactly the three specified literal arrays, none composed by
   reference — ✅.
2. Every role not in the relevant list gets `403` on all four mutating/
   viewing endpoints — ✅ by static review; ✅ confirmed live below across
   the full `protocol`/`medical_secretary`/`doctor`/`cashier` matrix.
3. `seminars`/`seminarAttendance` have zero client-reachable paths in
   `firestore.rules` — ✅ (`allow read, write: if false`), deployed to
   `erp-lfd`.
4. Every attendance-listing path goes through `getSeminarAttendance`,
   exactly one `seminar_attendance_view` per call, and the seminar
   event list/detail writes no audit entry — ✅, confirmed live below.
5. `customers/[id]/page.tsx`'s diff (across *all* commits in this range,
   not just Task 6's own) touches only the import, the guard's capability
   list (the fix), the two new derived-data lines, and the
   `ClinicalSection` invocation — Purchase History/Upcoming appointments/
   Lab orders sections byte-identical — ✅.
6. `ClinicalSection.tsx`'s treatments-table JSX is byte-identical for any
   `canViewClinical: true` render — ✅, traced line-by-line in Task 6's
   review.
7. `DELETE /api/customers/[id]` blocks independently on all five
   collections — ✅, confirmed live below with a customer isolated to
   only the new `seminarAttendance` reference.
8. `Sidebar.tsx`'s `NavLink.capability` generalization doesn't change
   filtering for any pre-existing single-capability nav link — ✅.
9. The Task 6 fix is present and not undone by the later TD-3 commit — ✅.

### Live verification (real data, `erp-lfd`, per this project's standing
policy — user go-ahead obtained separately for the rules/index deploy and
for the live-data verification itself)

Deployed to `erp-lfd` first: `firestore.rules` and `firestore.indexes.json`
(both new `seminars`/`seminarAttendance` composite indexes). 33/33 checks
passed:

- **Roles provisioned**: `test.protocol@lfdservices.com` created fresh
  (Auth user + staff doc + custom claims, mirroring `POST /api/staff`'s
  exact sequence); passwords reset on the existing reusable
  `test.doctor@lfdservices.com`, `test.medsec@lfdservices.com`,
  `test.admin@lfdservices.com`, and `ikeja.cashier@lfdservices.com`
  fixtures (no prior-session password retained access) — new passwords
  handed to the user, accounts kept per explicit user decision rather than
  deleted.
- **Seminar create/edit boundary**: `medical_secretary` created a real
  hybrid-format seminar (`201`) and later edited its title (`200`);
  `doctor`/`protocol`/`cashier` all got `403` on create, `protocol`/
  `doctor` both got `403` on edit.
- **Attendance recording, both methods**: `protocol` recorded one
  `physical` and one `online` attendance entry against the real "Test
  Patient" customer for the new seminar — both `201`;
  `medical_secretary`/`doctor`/`cashier` all got `403` on the same
  endpoint.
- **Attendance viewing boundary**: `doctor`/`medical_secretary`/
  `protocol`/`admin` all got `200` with exactly 2 entries from
  `GET /api/seminar-attendance?seminarId=...`; `cashier` got `403`.
- **Customer detail page**: `protocol` reached the page (`200`, not the
  prior `307` redirect — confirming the mid-phase fix), saw the "Seminar
  attendance" section, and did *not* see "Purchase history"; `cashier`
  reached the page (holds `crm.customer.view`) but did *not* see "Seminar
  attendance" — proving the two gates are independent, not one implying
  the other.
- **Audit log**: exactly 1 `seminar_create`, 1 `seminar_edit`, 2
  `seminar_attendance_record`, and 5 `seminar_attendance_view` entries for
  this run (4 from the direct `GET` boundary checks + 1 from `protocol`'s
  customer-page render); zero entries under any `seminar_view`-style name.
- **TD-3 fifth check**: a customer referenced by nothing at all deleted
  successfully (`200`); a second, freshly-created customer referenced
  *only* by a new `seminarAttendance` record was blocked (`409`,
  `"Cannot delete a customer that is still referenced by a seminar
  attendance record"`) — isolating the new check exactly as the plan's
  exit criteria required, not relying on the existing "Test Patient"
  customer (which already carries `treatments`/`appointments` from prior
  phases and couldn't isolate this specific check).

Per explicit user decision, all test data created during this
verification — the seminar, its 3 attendance records, and the 2 TD-3 test
customers — was deleted after the checks passed; the reusable `test.*`
staff accounts (including the new `test.protocol`) were kept, with their
new passwords handed to the user. The dev server was stopped.

## Known issues (updates to `docs/tech-debt.md`)

**TD-3 remains resolved**, now covering five collections
(`sales`/`treatments`/`appointments`/`labOrders`/`seminarAttendance`)
independently, per this phase's Task 7. The standing question from
Phase 15 — whether the allowlist-of-dependent-collections shape should
become a soft-delete/archive model — is **still open**, not decided by
this phase, per the plan's explicit scope boundary (add the fifth check,
don't reconsider the model). Five collections now depend on this pattern;
worth deciding before a sixth arrives.

No new tech debt introduced by this phase's own code. Two Minor,
non-blocking findings from the final whole-branch review, both
precedent-consistent with the rest of the app rather than regressions:
seminar-scoped attendance views (`getSeminarAttendance({ seminarId })`)
log `targetUid: null`/`details: null`, so the audit trail can't identify
*which* seminar's roster was viewed from the log entry alone (same
TD-1-shaped gap as `getAppointments`/`getLabRecords`); and the seminar
detail/new pages read the full `customers`/`branches` collections
unbounded, consistent with this app's "read on demand, revisit at scale"
stance.

## Assessment

**Ready to merge: Yes.** Zero Critical/Important findings at any task or
the final whole-branch review; the one Important finding raised mid-phase
(Task 6's `protocol`-unreachable-page gap) was fixed and re-reviewed clean
before the phase proceeded. All seven plan-mandated decisions and the
whole-branch execution checklist held under both static review and live
verification against real production data, including the genuinely new
three-way capability split this phase introduced — the first
clinical-adjacent access-control shape in this project that is not a
subset/superset of the existing clinical wall.
