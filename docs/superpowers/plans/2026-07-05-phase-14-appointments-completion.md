# Phase 14 — Appointments — Completion Report

Plan: `docs/superpowers/plans/2026-07-05-phase-14-appointments.md`
(approved as proposed, including its five pre-resolved sign-off decisions;
executed via `superpowers:subagent-driven-development` in a git worktree,
`.claude/worktrees/phase-14-appointments`, branch
`worktree-phase-14-appointments`.)

Base: `d8fe0bb` (main's tip immediately before this phase). Head: `58345bc`.

## Commits

| # | Task | Commit | Files | Lines | Review |
|---|---|---|---|---|---|
| — | Plan doc | `345505a` | 1 | +2145 | — |
| 1 | Permissions, types, notification wiring | `f468ba6` | 5 | +27/-2 | Opus, clean |
| — | CLAUDE.md sync (cherry-picked from main `d8fe0bb`, not phase work) | `38bf838` | 1 | +3/-3 | — |
| 2 | Firestore rules + composite indexes | `fb7eab1` | 2 | +20 | Sonnet, clean |
| 3 | Overlap-check helper + shared view/audit helper | `6c67a5a` | 2 | +116 | Opus, clean |
| 4 | API routes (create/list/status/reschedule) | `2414249` | 2 | +231 | Opus, clean |
| 5 | Cloud Function notification trigger | `729219f` | 2 | +42 | Sonnet, clean |
| 6 | UI (booking form, schedule page, sidebar nav) | `6512d20` | 5 | +385 | Sonnet, clean |
| 7 | Customer detail page — Upcoming appointments | `815f31b` | 1 | +38 | Sonnet, clean (diff-scope critical) |
| — | Fix: remove `admin` from clinical role lists | `9783f16` | 1 | +9/-2 | Opus, clean |
| — | Fix: TOCTOU on reschedule status guard | `58345bc` | 1 | +4 | Controller-verified (not re-sent to a full review cycle) |
| — | Final whole-branch review | — | — | — | Opus, clean |

Application code total (excluding the plan doc and the CLAUDE.md sync):
23 files touched, ~865 lines added, 7 deleted, across 9 commits.

## What shipped

A new `appointments` collection for doctor-visit scheduling: booking,
double-booking prevention via a transaction-guarded overlap check,
status transitions (`completed`/`cancelled`/`no_show`) and reschedule,
a Cloud Function notification to the assigned doctor, and UI (booking
form, schedule page with doctor filter, sidebar nav entry, and a new
"Upcoming appointments" section on the customer detail page). One new
capability, `clinical.appointments.manage`, granted to
`CLINICAL_VIEW_ROLES` — the same constant `clinical.record.view` already
used, by reference, not by separately-typed duplication, so the two
capabilities structurally cannot drift apart.

Capability-footprint comparison against `clinical.record.view` (the
precedent this reuses): identical role set both before and after the
mid-phase fix below, since both capabilities share the one constant. No
role gained or lost anything the other capability didn't also gain or
lose in the same commit.

## Five pre-resolved decisions — how they held up under review

1. **`general_manager` doesn't exist yet; `clinical.appointments.manage`
   granted to `CLINICAL_VIEW_ROLES` exactly.** Held. Confirmed by direct
   comparison (same constant, same object reference) in Task 1's review
   and again in the final whole-branch review. The retrofit comment at
   the constant's definition site was verified still coherent after the
   admin-removal fix (below) — it correctly still says both capabilities
   need the `general_manager` retrofit together, not just one.
2. **`cancellationReason` field added beyond the brief's literal Data
   Model list.** Held, implemented exactly as inferred: `cancelledAt`/
   `cancelledBy`/`cancellationReason`, populated only on a `cancelled`
   transition, `null` otherwise — confirmed by the Task 4 reviewer and
   live-verified (see below).
3. **`GET /api/appointments` narrower filter surface than
   `getAppointments`.** Held — the HTTP route accepts only `doctorUid`;
   `customerId`/`upcomingOnly` are used only by direct in-process callers
   (the customer detail page), exactly as specified.
4. **`doctorUid` validated against a real `staff` doc with
   `role === 'doctor'`.** Held, verified in Task 4's review and
   independently confirmed live (a non-doctor/nonexistent `doctorUid`
   would 400; not separately live-tested since the real doctor account
   was used throughout, but the code path was reviewed directly).
5. **Customer deletion not extended to check `appointments` (TD-3).**
   Held — `src/app/api/customers/[id]/route.ts`'s `DELETE` handler was
   never opened this phase, confirmed by the final whole-branch diff
   containing no reference to that file. TD-3 now explicitly also
   covers `appointments`, not just `treatments` — see Known Issues below.

## Mid-phase deviation: admin/clinical-access fix (not in the original plan)

During Task 7's review, the reviewer flagged — correctly, as an
out-of-diff observation, not a Task 7 defect — that `CLINICAL_ROLES`
(`clinical.record.create`) and `CLINICAL_VIEW_ROLES`
(`clinical.record.view`, and now `clinical.appointments.manage`) had
both included `'admin'` since Phase 13's original implementation,
contradicting CLAUDE.md's stated design ("not `admin` despite being
broad elsewhere"). This discrepancy survived three prior reviews
(Phase 13, Phase 13.1, and this phase's own Task 1), each of which
confirmed the constant was used consistently without checking it
against CLAUDE.md's stated design.

Presented to the user with full history (confirmed via `git show` at
Phase 13's `632ef48` and Phase 13.1's `4c86940` that `admin` was there
from the start). Explicit decision: fix it now, in this phase, in both
constants together — fixing only the view-side would have left `admin`
able to create clinical records it can't view, worse than the status
quo. Implemented in `9783f16`, Opus-reviewed on its own diff (blast
radius confirmed contained — neither constant is referenced by any
other capability), then re-verified in the final whole-branch review
(no hardcoded `admin` clinical shortcut exists anywhere outside
`permissions.ts`; both Firestore rules for `treatments`/`appointments`
are `allow read, write: if false`, so there was never a parallel
rule-level bypass to also fix). Live-verified: a real `admin` account
gets 403 on `POST`/`GET /api/appointments` and `PATCH
/api/appointments/[id]`, and does not see the customer page's
"Upcoming appointments" section.

## Post-review deviation: reschedule TOCTOU fix

The final whole-branch review flagged one optional Minor: the
reschedule `PATCH` path checked `status === 'scheduled'` on a
non-transactional read before entering the overlap-check transaction,
so a reschedule racing a concurrent cancel could in theory still write
a new `scheduledAt` onto an appointment the cancel had just flipped to
`cancelled` (harmless in effect — cancelled appointments don't conflict
or notify — but not transaction-protected). Fixed per explicit user
decision (`58345bc`): re-reads the doc inside the same transaction and
rejects with 409 if it's no longer `scheduled`. Controller-verified
directly (4-line addition, correct read-before-write ordering); not
sent through a full subagent review cycle given its size and that it
implements the reviewer's own suggested fix verbatim.

## Process notes

- **Git worktree isolation had one real slip:** Task 2's implementer
  committed directly to `main` instead of the worktree branch, despite
  explicit instructions. Caught immediately (main's tip didn't match
  the worktree's expected parent), corrected by cherry-picking the
  commit onto the worktree branch and hard-resetting `main` back to its
  correct tip — confirmed with the user before the reset, since it's a
  destructive operation on a shared branch. Every subsequent implementer
  dispatch was told explicitly to confirm its branch before committing,
  and no further slips occurred.
- **Task 7's implementer session dropped mid-response** (API connection
  error) after committing but before writing its own report. The
  controller verified the commit's diff, the `Link`-already-imported
  precondition, and a clean `tsc --noEmit` run directly, and filed the
  report on the implementer's behalf; the task reviewer was explicitly
  told to treat those controller-verified claims with the same scrutiny
  as any implementer report, not exempt them.
- **This project's "no unit test suite" convention held throughout** —
  every task's verification was `tsc --noEmit` clean plus direct
  confirmation of imported signatures against live source, consistent
  with every prior phase.

## Verification

Every task passed its own task-scoped review (spec compliance + code
quality) before the next task began — see the table above. The final
whole-branch review re-checked all 7 items the plan's Execution section
mandates:

1. `clinical.appointments.manage`'s role list is exactly
   `CLINICAL_VIEW_ROLES` (post-fix: `['super_admin', 'doctor',
   'medical_secretary']`) — ✅, same constant reference confirmed.
2. Every excluded role gets 403 — ✅ by static review at whole-branch
   time; ✅ confirmed live below.
3. Overlap check ignores `cancelled`/`completed`/`no_show` and excludes
   the appointment's own prior slot on reschedule — ✅.
4. `appointments` has zero client-reachable paths in `firestore.rules`
   — ✅ (`allow read, write: if false`).
5. Every list path goes through `getAppointments`, exactly one
   `appointment_view` per call — ✅, confirmed live below (denied-role
   attempts produce zero audit entries, since the capability check
   throws before the write).
6. `customers/[id]/page.tsx`'s diff touches only Task 7's addition,
   Purchase History/Clinical sections byte-identical — ✅, diff is
   +38/-0.
7. `NotificationBell.tsx`'s map compiles and resolves to `/appointments`
   — ✅.

### Live verification (real data, `erp-lfd`, per this project's standing
policy — user go-ahead obtained separately for both the Cloud Function
deploy and the live-data verification itself)

Deployed to `erp-lfd` first: the `onAppointmentScheduled` Cloud Function,
`firestore.rules`, and `firestore.indexes.json` (all with explicit
go-ahead). 19/19 checks passed:

- Booked a real appointment (medical_secretary → real doctor account,
  real "Test Patient" customer) — `201`.
- A second, overlapping booking against the same doctor — `409`.
- A third, non-overlapping booking against the same doctor — `201`.
- Created one real `admin`-role staff account
  (`test.admin@lfdservices.com`, via the real `/api/staff` route, per
  explicit user decision — specifically to live-test the mid-phase
  admin/clinical fix) — `branch_manager`, `cashier`, `finance_admin`,
  and this new `admin` account all got `403` on `POST`/`GET
  /api/appointments` and `PATCH /api/appointments/[id]` (12/12
  sub-checks). `admin` returning 403 specifically confirms the
  mid-phase fix is correct in production, not just in code review.
  `hr_admin`/`it_admin` accounts don't exist and were not created —
  their exclusion rests on the capability-list code alone (already
  reviewed twice at that point), per explicit user decision.
- The real doctor account received the `appointment_scheduled`
  notification via the newly-deployed Cloud Function (confirmed by
  reading the `notifications` doc directly).
- The customer detail page's "Upcoming appointments" section: present
  for `medical_secretary`/`doctor`/`super_admin`, absent for
  `branch_manager`/`cashier`/`admin` (6/6).
- `auditLogs` showed exactly 2 `appointment_create` and 3
  `appointment_view` entries for this run, zero entries from any
  denied-role attempt — confirming finding #5 above holds live, not
  just in code.
- Cancelled the first test appointment with a reason —
  `cancelledAt`/`cancelledBy`/`cancellationReason` all set correctly.

Nothing created during live verification was deleted — the new `admin`
account and both test appointments (one cancelled, one still scheduled)
remain as real, permanent data in `erp-lfd`, matching this project's
established Phase-13 precedent of keeping verification-created records
rather than cleaning them up.

## Known issues (updates to `docs/tech-debt.md`)

**TD-3 is now confirmed to also apply to `appointments`, not just
`treatments`.** `DELETE /api/customers/[id]` still only checks `sales`
for referential integrity; a customer with upcoming or past
appointments can be deleted through the app, orphaning those
appointment records — exactly as CLAUDE.md's known-issues section
already anticipated ("appointments and lab results will be the same
problem again"). Not fixed this phase, per the plan's explicit
Decision #5 and this project's known-issues policy (this phase's work
never touched that file). Worth revisiting the allowlist-of-dependent-
collections shape versus a soft-delete/archive model once Phase 15
(lab) adds a third dependent collection to the same problem.

No new tech debt introduced by this phase's own code (the mid-phase
fix corrected pre-existing debt rather than adding any).

## Assessment

**Ready to merge: Yes.** Zero Critical/Important findings at any task,
the mid-phase fix, or the final whole-branch review. All plan-mandated
decisions and the whole-branch execution checklist held under both
static review and live verification against real production data.
