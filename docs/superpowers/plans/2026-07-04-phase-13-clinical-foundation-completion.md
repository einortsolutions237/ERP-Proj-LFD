# Phase 13 — Clinical Foundation — Completion Report

Plan: `docs/superpowers/plans/2026-07-04-phase-13-clinical-foundation.md`
(sent for review in chat, approved as proposed — including all 3 flagged
decisions: the `requireAnyCapability` OR-gate with purchase-history
independently walled off, `linkedSaleId` as a plain validated text field
rather than a picker, and `doctorUid`/`branchId` always server-derived —
then executed via subagent-driven-development: 4 tasks, one implementer
+ one Opus task reviewer each, plus one final Opus whole-branch review.)

## Commits

| Task | Scope | Commit | Files | Lines |
|---|---|---|---|---|
| 1 | Permissions & types foundation | `632ef48` | 4 | +29 / -2 |
| 2 | Firestore rules + composite index | `d7ae437` | 2 | +11 |
| 3 | API routes + view-logging helper | `40cf55b` | 2 | +161 |
| 4 | UI — customer detail page extension | `0174907` | 3 | +198 / -2 |
| Post-review fix | Reject unparseable `date` | `dffdd1e` | 1 | +5 / -1 |
| **Total** | | | **11 files** | **+403 / -4** |

Base: `a9e0d56` (head after the standalone CLAUDE.md correction commit,
same session). Head: `dffdd1e`. Working directly on `main`, no
worktree — matches every prior phase.

## Route files — confirmed untouched (the pre-existing ones)

`git diff --stat a9e0d56..dffdd1e -- src/app/api` shows exactly one
file: `src/app/api/treatments/route.ts` (new, 97 lines — this phase's
own deliverable). No existing route (`sales`, `staff`, `departments`,
`customers`, `stock/*`, or any other) appears anywhere in the diff.
Confirmed at every task review and again at the final whole-branch
review. No billing/POS logic was touched, per the brief's explicit
constraint.

## What shipped

A `doctor` role (client-SDK login path, non-branch-locked, added to
`ROLES` with zero special-casing elsewhere) with exactly two new
capabilities — `clinical.record.create`/`clinical.record.view` — granted
only to `doctor`/`admin`/`super_admin`. A new `treatments` collection
(`customerId`, `doctorUid`, `branchId` — record-keeping only, never used
for access scoping — `date`, `diagnosis`, `notes`, `prescription`,
`linkedSaleId`), fully closed in Firestore rules, all access through
`POST`/`GET /api/treatments`. Reads are genuinely org-wide — no
`isBranchLocked` check anywhere in the read path, since every
`clinical.record.view` holder is already non-branch-locked. Every
clinical-record *read*, not just every write, produces its own
`clinical_record_view` audit log entry (distinct from
`clinical_record_create`), via a single shared helper
(`getPatientTreatments()`) called by both the API route and the customer
detail page, so the logging logic exists exactly once. The customer
detail page gained the app's first "either capability" gate
(`requireAnyCapability`) so a doctor can reach the page without holding
`crm.customer.view` — while the existing purchase-history section stays
independently gated on `crm.customer.view` specifically, preserving the
wall.

## Behavior verification

Every task reviewer (Opus, throughout, given the access-control and
compliance stakes) traced its diff against the brief's requirements and
found zero drift. The final whole-branch review independently
re-verified every exit criterion against the actual final file state,
not the task reviews' word for it:

- **`doctor`'s capability footprint** is exactly `clinical.record.create`,
  `clinical.record.view`, plus (via the pre-existing `ALL_ROLES`
  mechanism, no new code needed) `hr.leave.request`/`hr.attendance.self`.
  Walked every `ROLE_CAPABILITIES` entry twice (once per task review,
  once at the final review) — `doctor` appears nowhere else.
  `STRICT_AUDIT_ROLES`/`BRANCH_LOCKED_ROLES` both confirmed untouched.
- **Org-wide reads/creates confirmed by reading the actual final code**:
  no `branchId`/`isBranchLocked` filtering anywhere in
  `getPatientTreatments.ts` or either verb of `api/treatments/route.ts`'s
  customer-facing logic.
- **`doctorUid`/`branchId` are unforgeable**: the POST route reads
  exactly 6 fields from the client body (`customerId`, `date`,
  `diagnosis`, `notes`, `prescription`, `linkedSaleId`) — `doctorUid` and
  `branchId` are set only from the authenticated session, confirmed by
  full trace of the write payload's construction at both the task review
  and the final review.
- **Distinct, unconditional audit-log writes**: `clinical_record_view`
  lives in exactly one place (the shared helper) and fires on every call;
  `clinical_record_create` lives in exactly one place (the POST route).
  The customer detail page only calls the helper `if (canViewClinical)`
  — confirmed load-bearing, since calling it unconditionally would have
  produced spurious view-log entries for commercial-only viewers.
- **Purchase-history section confirmed byte-identical**: every diff hunk
  touching that region contains only the wrapping
  `{canViewCommercial && (...)}` condition; the block was not even
  reindented, so every inner line shows as unchanged context, not a
  reformatted match. Re-verified independently by the final reviewer,
  not just the Task 4 reviewer.
- **`linkedSaleId`** validated correctly in both branches: absent (skips
  validation entirely, treatment created with `linkedSaleId: null`) and
  present (checked for existence, then ownership — existence-before-
  ownership order confirmed correct, so a non-existent sale ID can never
  reach the ownership check and produce a wrong error).
- **`treatments` Firestore rule** is a hard `allow read, write: if false`,
  correctly placed before the catch-all, which itself was confirmed
  present and unchanged.
- **Cross-task consistency**: `Treatment` (Task 1) ↔ the POST route's
  write shape ↔ `getPatientTreatments`'s read shape ↔ `TreatmentRow` ↔
  `ClinicalSection`'s consumption of it all agree field-for-field — no
  shape drift between the four independently-implemented tasks. The
  Firestore composite index (`customerId` ASC, `date` DESC) matches the
  actual query shape exactly.

## The post-review fix

The final review's one actionable Minor finding: `body.date` was
validated as a non-empty string but not as a parseable date, so a
malformed value would either 500 at the Admin SDK write or silently
persist as an `Invalid Date`. Fixed directly (`dffdd1e`) with a
`Number.isNaN(new Date(body.date).getTime())` guard returning a clean
400 — `tsc --noEmit` clean after the change. The other three Minor
findings (the customer page's `sales` query always running even for a
pure-doctor viewer — no data leak, just a wasted read; `GET
/api/treatments` having no current caller — a legitimate, correctly-
gated API surface, not dead code; the view-log's `branchId` being `null`
while the create-log's isn't, a deliberate asymmetry given org-wide
reads) were left as recorded, non-blocking observations, consistent with
how this project has always handled Minor findings.

## Live verification (performed, with your explicit go-ahead)

Deployed `firestore.rules`/`firestore.indexes.json` to `erp-lfd`
(`firebase deploy --only firestore:rules,firestore:indexes` succeeded
outright) — worth flagging on its own: an earlier phase's documented
blocker (the logged-in account lacking IAM permission to deploy to
`erp-lfd`) appears to no longer apply, which the project record should
reflect.

`erp-lfd` had zero customers in this environment (every prior phase's
UAT either used synthetic Firestore-only data cleaned up afterward, or
never seeded `customers` at all) — surfaced mid-verification and
confirmed with you before creating one, since the original go-ahead
named "a real existing customer." Created, via real app flows (not
direct Firestore writes), matching this project's established policy
that an exercise reaching real business records should persist as
legitimate operational data:

- A real `doctor` staff account (`test.doctor@lfdservices.com`, Downtown
  branch) via the existing `/staff/new` flow — the role dropdown showed
  "doctor" with zero UI changes needed, confirming Task 1's `ROLES`
  addition alone was sufficient to wire it into staff creation.
- A real customer ("Test Patient") via `/customers/new`.
- A real treatment record, created through the UI while signed in **as
  the doctor account** (not `super_admin` — this specifically exercises
  the actual role the feature is for): date 2026-07-04, diagnosis
  "Seasonal allergy - mild rhinitis", a prescription, no `linkedSaleId`
  — confirming the "works correctly without one" path.

Verified, via custom-token sign-in for each real account (no stored or
guessed passwords, same technique as Phases 8/12) and direct `fetch`
calls against the API routes, not just UI absence:

- **`super_admin`**: sees Purchase history (empty) + Clinical record
  (empty, then populated) on the new customer's page.
- **`doctor`**: sees Clinical record + basic identity fields (name,
  phone, email, address, notes) — **no Purchase history section at all,
  no Edit/Delete** — the wall holding exactly as designed, live, not
  just in review. Treatment created via the UI appeared immediately with
  correct doctor-name resolution ("Dr. Test Doctor" — confirming the
  `staff` doc lookup in `getPatientTreatments`).
- **`cashier` (Ikeja)** and **`branch_manager` (Downtown)**: both see
  Purchase history (correctly — they hold `crm.customer.view`/`manage`)
  but **no Clinical record section at all**; both `GET` and `POST
  /api/treatments` return 403 for both accounts via direct `fetch` calls.
- **`auditLogs` query** (filtered by `targetUid` = the test customer)
  shows exactly the expected sequence: `customer_create` (super_admin) →
  `clinical_record_view` (super_admin, empty section) →
  `clinical_record_view` (doctor, empty section) →
  `clinical_record_create` (doctor, `branchId` correctly the doctor's
  own Downtown branch) → `clinical_record_view` (doctor, post-create
  page refresh). **Zero** clinical audit entries exist for either the
  cashier's or the branch_manager's 403 attempts — confirming they never
  reached the capability-gated code at all, not merely that the response
  was blocked.

Session restored to the original `super_admin` afterward. Every
temporary script and ID token was deleted immediately after use and
never committed.

**Real data now persisting in `erp-lfd`** (by design, per the go-ahead):
1 doctor staff account, 1 customer, 1 treatment record, 5 new
`auditLogs` entries.

## Self-critique per task

- **Task 1 (Permissions foundation)** — the highest-leverage task for
  the least code: 29 lines, and the entire "no accidental inheritance"
  guarantee rests on it. Both the task reviewer and the final reviewer
  independently recomputed the full capability footprint rather than
  trusting the implementer's report — this is exactly the kind of task
  where "looks right" and "is right" can diverge by one misplaced role
  name, so the double independent recomputation was worth the review
  cost.
- **Task 2 (Firestore rules + index)** — the smallest, least eventful
  task, and correctly so: it's a copy of an already-proven pattern
  (`leaveRequests`/`attendanceRecords`/`notifications`), not a place for
  creativity. Zero findings, zero surprises.
- **Task 3 (API routes)** — the task with the most genuinely new
  ground: the view-logging pattern has no precedent anywhere else in
  this app. The shared-helper design (one logging call site, used by
  both the route and the page) is the piece of this phase I'd point to
  if asked to justify the architecture — it's the only thing standing
  between "every read is logged" being true by construction versus true
  by two independently-maintained copies quietly drifting apart later.
- **Task 4 (UI)** — the task most likely to have silently broken
  something, and the one most thoroughly checked for exactly that: two
  independent reviewers (task + final) verified the purchase-history
  diff hunk by hunk, not just read the implementer's claim. The
  conditional-fetch detail (`canViewClinical ? await
  getPatientTreatments(...) : []`) is easy to get wrong in a way that
  still "looks" correct (e.g. calling it unconditionally and only gating
  the *render*) — both reviewers specifically traced that this would
  have caused spurious audit entries, which is the kind of bug that
  wouldn't show up in a screenshot.

## Final whole-branch review verdict

**Ready to merge: Yes.** Zero Critical or Important findings across all
four task reviews and the final whole-branch review. One Minor finding
fixed post-review (unparseable-date guard); three Minor findings left as
recorded, non-blocking observations. All three pre-approved design
decisions held under review and under live verification. Live
verification exercised every exit criterion against the real running
app and real data, not just diff-argued.
