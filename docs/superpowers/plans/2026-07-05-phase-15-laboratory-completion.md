# Phase 15 — Laboratory — Completion Report

Plan: `docs/superpowers/plans/2026-07-05-phase-15-laboratory.md`
(approved as proposed, including its five pre-resolved sign-off decisions;
executed via `superpowers:subagent-driven-development` in a git worktree,
`.claude/worktrees/phase-15-laboratory`, branch
`worktree-phase-15-laboratory`.)

Base: `feb99e7` (main's tip immediately before this phase). Head: `e053f1a`.

## Commits

| # | Task | Commit | Files | Lines | Review |
|---|---|---|---|---|---|
| — | Plan doc | `ff581bb` | 1 | +965 | — |
| 1 | Permissions, types, audit actions, notification wiring | `fb46e21` | 6 | +39/-1 | Opus, clean |
| — | CLAUDE.md tag/status sync (cherry-picked from main `feb99e7`, not phase work) | `e7c2ccd` | 1 | +1/-1 | — |
| 2 | Firestore rules + composite index | `ff76cfa` | 2 | +14 | Sonnet, clean |
| 3 | Shared `getLabRecords` view/audit helper | `1b78682` | 1 | +107 | Sonnet, clean |
| 4 | API routes (order creation, list, result entry) | `3974f74` | 2 | +185 | Opus, clean |
| 5 | Cloud Function notification trigger | `473e1a3` | 2 | +41 | Sonnet, clean |
| 6 | UI — order/results forms, lab section, placeholder removal | `d1061ec` | 4 | +340/-4 | Sonnet, clean |
| 7 | Customer detail page — Lab section | `43b1b25` | 1 | +9 | Sonnet, clean (diff-scope critical) |
| 8 | Resolve TD-3 comprehensively | `e053f1a` | 1 | +13 | Sonnet, clean |
| — | Final whole-branch review | — | — | — | Opus, clean |

Application code total (excluding the plan doc and the CLAUDE.md sync):
18 files touched, ~748 lines added, 5 deleted, across 8 commits.

## What shipped

A new `labOrders`/`labResults` collection pair — the third clinical
collection, after `treatments` and `appointments`. Two new capabilities:
`clinical.lab.manage` (order + record results), granted to `CLINICAL_ROLES`
by reference (`super_admin`, `doctor` — **not** `medical_secretary`, a
deliberate narrower grant than the view capability, since results entry
stays with the actor set that already holds `clinical.record.create`); and
`clinical.lab.view`, granted to `CLINICAL_VIEW_ROLES` by reference
(`super_admin`, `doctor`, `medical_secretary`). Both reuse the exact
constants `clinical.record.*`/`clinical.appointments.manage` already use —
structurally incapable of drifting from them, the same lesson Phase 14's
mid-phase fix established.

Results entry is the one transaction-critical write this phase: it
atomically creates the `labResults` doc and flips the referenced order's
`status` from `ordered` to `completed`, rejecting a second submission
against an already-completed order with `409`. A Cloud Function
(`onLabResultEntered`) notifies the ordering doctor, following the exact
`onAppointmentScheduled` template. The customer detail page gained a "Lab
orders" section (replacing Phase 13's placeholder), and `ClinicalSection.tsx`
had that same placeholder removed (the Phase 16 "Seminar attendance"
placeholder in the same file is untouched). `DELETE /api/customers/[id]`
was comprehensively extended to block on `treatments`, `appointments`, and
`labOrders` together — resolving TD-3 in full, not adding a fourth narrow
check.

Capability-footprint comparison against `clinical.record.*`: `clinical.lab.manage`
resolves to exactly the same two roles as `clinical.record.create`
(`CLINICAL_ROLES`, same object reference); `clinical.lab.view` resolves to
exactly the same three roles as `clinical.record.view`/
`clinical.appointments.manage` (`CLINICAL_VIEW_ROLES`, same object
reference). Live-verified: `medical_secretary` gets `403` on order/results
creation but `200` on listing — the manage/view split is real, not just a
paper distinction.

## Five pre-resolved decisions — how they held up under review

1. **`doctorUid`/`branchId` use `treatments`' simple derivation, not
   `appointments`' target-staff-doc-validation.** Held — both fields are
   always `user.uid`/`user.branchId` directly from the session, verified
   in Task 4's review (zero client-supplied path to either field) and in
   the final whole-branch review.
2. **Result entry is transaction-guarded; re-entry against a completed
   order is rejected.** Held — the transaction reads the order, checks
   `status !== 'ordered'` (409 if so), then writes the result doc and
   flips the status, all inside one `runTransaction` callback with the
   read before either write. Live-verified: a second submission against
   the same order returned `409`.
3. **`GET /api/lab-orders?customerId=` is a real, symmetric HTTP route**
   (unlike `appointments`' narrower surface). Held, and this decision paid
   off directly: it's exactly the endpoint live verification used to prove
   the `medical_secretary` view/manage split, which wouldn't have had a
   clean HTTP surface to test otherwise.
4. **Notification `relatedId` is the customer's ID, linking to
   `/customers/{id}`.** Held — live-verified: the real notification's
   `relatedId` matched the customer's actual ID, and `NotificationBell.tsx`
   resolves it to the correct page.
5. **Only `labOrders` needs a composite index; `labResults` needs none.**
   Held — confirmed in Task 2's review and the final whole-branch review;
   the 1:0-or-1 `labResults` lookup (a single equality filter, `limit(1)`)
   never needed one.

## Process notes

- **No worktree/branch mistakes this phase** — every implementer
  confirmed its branch before committing (a standing instruction added
  after Phase 14's slip), and none repeated it.
- **The recurring CLAUDE.md-staleness pattern showed up again, in a new
  form.** This worktree's fork point was current with `main`, but `main`'s
  own `CLAUDE.md` had gone stale *between* two of the controller's own
  actions in the same session: the Phase 14 completion commit correctly
  marked Phase 14 done, but its "Current status" line still said "Phase 14
  has not yet been tagged" and "Phase 15 not yet planned" — because the
  user's follow-up requests (tag `phase-14-baseline`, push it, start
  Phase 15) happened later in the same session and `CLAUDE.md` was never
  revisited after them. Fixed on `main` (`feb99e7`) and cherry-picked into
  this worktree (`e7c2ccd`) before Task 2 began. Distinct from Phase 14's
  own staleness incident (a worktree lagging main by one commit) — this
  time main's own file was stale relative to the session's own later
  actions, a controller process gap rather than a worktree-sync gap.
- **This project's "no unit test suite" convention held throughout** —
  every task's verification was `tsc --noEmit` clean plus direct
  confirmation of imported signatures against live source, consistent
  with every prior phase.

## Verification

Every task passed its own task-scoped review (spec compliance + code
quality) before the next task began — see the table above. The final
whole-branch review re-checked all 9 items the plan's Execution section
mandates:

1. `clinical.lab.manage`'s role list is exactly `CLINICAL_ROLES`
   (same as `clinical.record.create`) and `clinical.lab.view`'s is exactly
   `CLINICAL_VIEW_ROLES` (same as `clinical.record.view`/
   `clinical.appointments.manage`) — ✅, same constant reference confirmed.
2. Every excluded role gets 403 — ✅ by static review at whole-branch
   time; ✅ confirmed live below, including the `medical_secretary`
   manage/view split specifically.
3. The result-entry transaction rejects re-entry and is atomic — ✅,
   confirmed live below.
4. `labOrders`/`labResults` have zero client-reachable paths in
   `firestore.rules` — ✅ (`allow read, write: if false`).
5. Every list path goes through `getLabRecords`, exactly one `lab_view`
   per call — ✅, confirmed live below (denied-role attempts produce
   zero audit entries).
6. `customers/[id]/page.tsx`'s diff touches only Task 7's addition,
   Purchase History/Clinical record/Upcoming appointments byte-identical
   — ✅, diff is +9/-0.
7. `ClinicalSection.tsx`'s diff is exactly the 4-line Lab-results
   placeholder deletion, Seminar attendance untouched — ✅, diff is
   -4/+0.
8. `NotificationBell.tsx`'s map compiles and resolves to
   `/customers/{customerId}` — ✅.
9. `DELETE /api/customers/[id]` blocks independently on `sales`/
   `treatments`/`appointments`/`labOrders` — ✅, and the field-name risk
   a task reviewer flagged (does each collection really store the
   reference as `customerId`) was independently re-verified by both the
   controller and the final reviewer directly against all three creation
   routes — confirmed.

### Live verification (real data, `erp-lfd`, per this project's standing
policy — user go-ahead obtained separately for both the Cloud Function
deploy and the live-data verification itself)

Deployed to `erp-lfd` first: the `onLabResultEntered` Cloud Function,
`firestore.rules`, and `firestore.indexes.json` (all with explicit
go-ahead). 32/32 checks passed:

- Ordered a real lab test as `doctor` (order `QgUrbenxlgEo3Flocyw7`,
  Complete Blood Count, real "Test Patient" customer) — `201`.
- 14/14 cross-role checks: `branch_manager`/`cashier`/`finance_admin`/
  `admin` all `403` on `POST /api/lab-orders`, `POST /api/lab-results`,
  and `GET /api/lab-orders`. `medical_secretary` correctly `403` on both
  create routes (lacks `clinical.lab.manage`) but `200` on `GET`
  (holds `clinical.lab.view`) — the manage/view split proven live, not
  just documented.
- Entered structured results (two value rows, each with
  parameter/value/unit/referenceRange/flag) — `201`; confirmed the
  order's `status` flipped to `completed`.
- A second results submission against the same order — `409`.
- The real doctor account received the `lab_result_entered` notification
  via the newly-deployed Cloud Function, `relatedId` matching the
  customer's real ID (Decision #4).
- The customer detail page's "Lab orders" section: present for
  `doctor`/`medical_secretary`/`super_admin`, absent for
  `branch_manager`/`cashier`/`admin` (6/6).
- `auditLogs` showed exactly 1 `lab_order_create`, exactly 1
  `lab_result_create`, and 4 `lab_view` entries for this run, zero from
  any denied-role attempt.
- TD-3: created one new customer ("Lab Test Only Customer",
  `tcjuA9fEe8YZfXC9iN2C`) referenced by nothing but a new lab order
  (`M5NNNedqzrAyLU2rfBwU`, deliberately left in `ordered` status, no
  result entered) — confirmed the `labOrders` deletion check
  independently fires (`409`) with no `sales`/`treatments`/`appointments`
  present for that customer. (The existing "Test Patient" customer, which
  already carries `treatments` and `appointments` from Phases 13/14,
  can't isolate the new `labOrders` check on its own — this new customer
  was the correct way to prove independence, and those two earlier checks
  were already proven independently in their own phases' live
  verification.)

One test-harness mistake during verification, not a product bug: the
first deletion attempt used the `doctor` account, which correctly
returned `403` (`doctor` doesn't hold `crm.customer.manage`, nor
`crm.customer.create` — so the new customer itself was created as
`super_admin` too). Retried correctly as `super_admin` and got the
expected `409`.

Nothing created during live verification was deleted — the lab order,
its results, the notification, the new customer, and its lab order all
remain as real, permanent data in `erp-lfd`, matching this project's
established precedent from Phases 13/14.

## Known issues (updates to `docs/tech-debt.md`)

**TD-3 is now fully resolved.** `DELETE /api/customers/[id]` blocks on
all four dependent collections (`sales`, `treatments`, `appointments`,
`labOrders`) independently, each verified live. `labResults` needs no
separate check — a result always belongs to an order that already
references the customer, so blocking on `labOrders` transitively covers
it, confirmed both in code review and by the live verification's new
"Lab Test Only Customer" scenario.

No new tech debt introduced by this phase's own code. The standing
question CLAUDE.md and the plan both raise — whether the
allowlist-of-dependent-collections shape should eventually become a
soft-delete/archive model once a fifth dependent collection exists
(Phase 16's seminar attendance is the next candidate) — remains open,
not resolved here; noted for whoever plans that phase.

## Assessment

**Ready to merge: Yes.** Zero Critical/Important findings at any task or
the final whole-branch review. All plan-mandated decisions and the
whole-branch execution checklist held under both static review and live
verification against real production data, including the one genuinely
new distinction this phase introduced (the `clinical.lab.manage`/
`clinical.lab.view` split excluding `medical_secretary` from authoring
while including it in viewing).
