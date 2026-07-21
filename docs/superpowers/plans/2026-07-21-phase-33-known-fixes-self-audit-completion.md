# Phase 33 — Known Fixes + Comprehensive Self-Audit — Completion Report

**Date:** 2026-07-21
**Plan:** specified directly in this session's phase brief (no separate plan doc — same as Phase 32, the front-end refinement verification pass immediately before this one)
**Status:** Complete. Build and tests both confirmed clean. The self-audit found a genuine 9th instance of this project's recurring unconditional-branchId-check bug class — fixed in-phase, live-verified. Two further Important-severity design-consistency findings and one content-completeness finding logged for a future phase, not fixed here, per this phase's own scope discipline.

## Summary

Two distinct tasks, per the phase brief: Task 1 was a bounded list of four already-identified items; Task 2 was a systematic self-audit of the codebase, explicitly scoped to *report* findings with severity rather than fix everything found. This report restores the project's standard completion-report format after the two most recent phases (32, and the front-end refinement pass before it) shipped without one.

Everything in Task 1 is done. Task 2's audit surfaced one finding serious and small enough to fix immediately (the 9th instance of the branch-scoping bug class, in `customers/[id]/page.tsx`'s Purchase History query) and three more logged for later, consistent with the phase's explicit instruction not to let the audit balloon into an unplanned fix-everything pass.

## Task 1 — known, specific fixes

1. **Build and test status, confirmed explicitly.** `npm run build` — exit 0, compiles clean, `tsc` passes inline, all 84 routes generate. `npm test` — 505/505 passing, 17 test files, ~18s. Both re-confirmed a second time after Task 1.2's and Task 2a's code changes, still clean.

2. **`assertBranchAccessible` helper extracted.** New `src/lib/auth/assertBranchAccessible.ts`: `assertBranchAccessible(role, recordBranchId, viewerBranchId)` — the same `isBranchLocked(role) && recordBranchId !== viewerBranchId → notFound()` logic that `staff/[staffId]/page.tsx` and `departments/[id]/page.tsx` each implemented independently (the fix from the immediately-preceding session, itself the 8th instance of this bug class). Both pages now call the shared helper instead. Behavior confirmed byte-identical under substitution (diff-reviewed directly), and live re-verified: `general_manager` (Downtown) still correctly opens a freshly-created Ikeja-branch department; `branch_manager` (Ikeja) still correctly 404s on a freshly-created Downtown-branch department. Test data cleaned up afterward.

3. **Phase 28's outstanding `nurse` live-check, completed.** Signed in as the real `test.nurse@lfdservices.com` account and opened the real, permanent Phase 13/14/15 synthetic patient (`vmbTAg3G0iJZ0skXi1tA`, which carries a real treatment, a completed appointment, and three lab orders). Confirmed live and via screenshot: `nurse` sees **only** Lab orders (view-only — no "Enter results"/"Order lab test" actions, matching its lack of `clinical.lab.order`/`clinical.lab.results.enter`) plus its own Patient demographics/Nursing visits sections (`clinical.intake.*`). No Clinical record/treatments section, no Upcoming appointments section, no Purchase history, no Seminar attendance — exactly the boundary Phase 28's code review had already concluded was correct, now confirmed live rather than left as an interrupted session-timing race.

4. **TD-4 and TD-5, read and summarized** (from `docs/tech-debt.md`, both logged during Phase 19/Messaging, both "Not scheduled — accepted as a known limitation," 2026-07-07):
   - **TD-4** — a deleted staff member's conversations become permanently unreachable, though the data survives. `DELETE /api/staff/[staffId]` deletes both the Firestore doc and the Firebase Auth account; `getMessagingParty()` reads live Auth claims, so once the account is gone the thread 404s for the surviving participant and the conversation drops off their list — even though the `conversations` doc and every `messages` doc are never deleted. Same underlying shape as TD-3 (data outlives the routes that can reach it), for staff deletion instead of customer deletion. Two proposed fixes on record: surface orphaned conversations using their own denormalized `participantNames`/`participantRoles` as a placeholder, or add a TD-3-style dependent-collection delete-guard — deliberately not decided, pending a real product decision about whether staff deletion should ever be blocked by message history.
   - **TD-5** — deactivated (disabled, not deleted) staff remain fully messageable. `PATCH /api/staff/[staffId]` deactivation sets `employment.status: 'inactive'` and disables Firebase Auth sign-in, but leaves the `staff` doc and Auth custom claims intact; neither the conversations-candidate query nor `getMessagingParty()` checks `employment.status`. Net effect: a disabled staff member still appears reachable, `canMessage` still passes, and a message can still be sent — producing a real notification for an account that can no longer log in to read it. Low risk (a dead-letter notification, not a forbidden relationship opening) — proposed fix on record: exclude `employment.status === 'inactive'` from the candidate set and have `getMessagingParty()` return null/a distinct signal for inactive recipients.
   
   Both are read-and-report only, per the task — no code changed for either.

## Task 2 — comprehensive self-audit

Two independent, fresh research agents ran the grep-heavy searches in parallel (branch-scoping pattern search; design-system consistency), while the general review (dead links, error states, incomplete screens) was done directly via live navigation. Findings below, severity per this project's Critical/Important/Minor vocabulary.

### 2a. Branch-scoping bug class search — **one real Critical/Important finding, fixed in-phase**

26 dynamic-route files checked (15 API routes, 11 dashboard pages) beyond the Task 1.2 pattern. 25 were confirmed correct — either already gated via `isBranchLocked()`/`assertBranchAccessible()`, a role-specific check functionally equivalent to `isBranchLocked()` given that capability's actual grant set (`pos.sale.void`, `hr.leave.approve` — both granted to exactly one branch-locked role, `branch_manager`), or a genuinely org-wide collection needing no gate at all (products/services/suppliers/customers/branches/attachments).

**One finding, previously unnoticed because it's a query-level `.where()` filter rather than a per-doc `if`:** `src/app/(dashboard)/customers/[id]/page.tsx`'s Purchase History section unconditionally scoped its `sales` query to `user.branchId`, with a comment incorrectly asserting this was intentional and consistent with the rest of the app — directly contradicting Phase 20's resolved `GET /api/sales` decision (org-wide roles see every branch's sales). Effect: `super_admin` and `medical_secretary` (the two non-branch-locked roles holding `crm.customer.view`) were silently missing purchase history for any sale outside their own `branchId`, not just narrowed — a real, live, 9th instance of this project's most-repeated bug class.

**Fixed in-phase** (small, obvious, directly on-theme for this phase's own Task 1.2): added an `isBranchLocked(user.role)` branch — branch-locked roles keep the original indexed, DB-ordered query unchanged; org-wide roles query by `customerId` alone (a single equality filter, auto-indexed by Firestore, no new composite index needed) and sort in memory afterward — the same pattern `getLabRecords.ts` already established in Phase 19.2 for this exact problem shape, chosen specifically to avoid needing a new Firestore index deployment. `tsc`/505 tests clean after the change.

**Live-verified** with real data: a real `ikeja.cashier` created a real customer and a real Ikeja-branch sale through the actual checkout flow; signed in as the real `super_admin` (Downtown branch) and confirmed the Ikeja purchase now appears in Purchase History — invisible before the fix. The test sale was voided (not hard-deleted) afterward so its stock decrement reverses correctly through the proper transaction path; the test customer could not be deleted (TD-3's dependent-collection guard correctly blocks it — the voided sale still references it, by design, for the audit trail) and is left in place, consistent with this project's established precedent (Phase 13, Phase 30.2) for verification artifacts the app's own design prevents cleanly removing.

### 2b. Design system consistency audit

| Finding | Severity | Detail |
|---|---|---|
| `roles/page.tsx`, `RoleMatrix.tsx`, `RoleReassignmentTable.tsx` | **Important** | Entire Roles module still on the pre-Phase-21 treatment: `border-collapse` tables, raw `bg-gray-50`/`text-gray-*`/`text-red-600`, no `rounded-2xl`, no `shadow-card`. Confirmed the last screen never touched by any design-rollout phase — matches this project's own "still unstyled" claim. |
| Seminars module (`SeminarForm.tsx`, `AttendanceForm.tsx`, `AttendanceTable.tsx`, `SeminarDetailClient.tsx`, `seminars/page.tsx`) | **Important** (functional check confirms not broken, purely cosmetic) | Built in Phase 16, before the design system existed. Picked up correct color tokens for free (they cascade globally via CSS custom properties) but never got the structural treatment — `rounded-md` throughout, zero `shadow-card` anywhere. Not on any existing "still unstyled" list — a genuinely new finding. |
| 8 isolated `rounded-md` buttons scattered across otherwise-current files (`AttachScanForm.tsx`, `LabResultForm.tsx` ×2, `AttachReceiptForm.tsx`) | Minor | Each file is otherwise fully on the current system; only a single button/icon per file lags on radius convention. |
| `RevenueTrendChart.tsx` literal hex colors | **False positive, not a finding** | Deliberate and already documented — Recharts SVG props don't consume Tailwind classes, so the literal values are the token values themselves, not a leftover. |

Two stale documentation claims corrected during the audit: `IntakeSection.tsx` **is** fully migrated (the Phase 31 note claiming this was correct; an earlier note calling it deliberately deferred is now superseded and should be treated as outdated). The Sales Log list/table (`pos/sales/page.tsx` / `SalesTable.tsx`) **is** fully migrated (`rounded-2xl`/`shadow-card`, tinted badges, `font-mono text-right`, real empty state) — the "still unstyled" claim for this specific file is stale and should be dropped from that list.

None of these were fixed this phase — all four (Roles, Seminars, the 8 isolated buttons, and the two doc corrections) are logged here as the basis for a properly scoped design-rollout follow-up, per the phase's explicit instruction.

### 2c. General review — dead links, error states, incomplete screens

- **No dead links found.** Every `href` in `Sidebar.tsx` cross-checked against actual `page.tsx` files under `src/app/(dashboard)` — all resolve.
- **No `TODO`/`FIXME`/`XXX`/"not implemented" markers anywhere in `src/`** — a clean signal, consistent with this project's discipline of not leaving half-finished work behind text markers.
- **One real, previously unflagged content-completeness gap, Important severity:** `SalesTable.tsx` (Sales Log list) renders the raw `cashierUid` string directly (`{row.cashierUid}`, truncated to 10rem) instead of a resolved staff name — while the sale *detail* page one click away (`getSaleDetail.ts`, Phase 29) already resolves cashier/customer/product/voidedBy names with graceful fallback. A real, visible usability gap on a page staff use daily (they can't tell at a glance who made a sale), directly analogous to a pattern this project has already solved elsewhere in the same module — a natural, well-scoped candidate for a small follow-up fix. Not fixed this phase (out of Task 1's bounded list, and not "directly touched" by this phase's own edits).
- Live-navigated and confirmed functionally correct (rendering real data, proper empty states, no errors): Roles (styling issue only, not functional), Sales Log, Reports (Inventory, P&L), Branches, Messages, Settings, Seminars (styling issue only, not functional).

## Verification

- **`npm run build`**: clean, exit 0, `tsc` passes inline, all 84 routes generate. Confirmed twice — once before any code changes (Task 1.1's own deliverable), once after all of this phase's edits.
- **`npm test`**: 505/505 passing throughout, re-run after every code change this phase (the `assertBranchAccessible` extraction, the `customers/[id]/page.tsx` fix), zero regressions.
- **Live browser verification**, real `erp-lfd` data, real session cookies (Admin-SDK custom-token exchange), genuine browser navigation:
  - `nurse` boundary check on the real Phase 13 synthetic patient (Task 1.3).
  - `assertBranchAccessible` refactor re-verified behavior-identical (`general_manager` cross-branch open + save; `branch_manager` still correctly 404s) — fresh test departments created and deleted.
  - The Purchase History branch-scoping fix (2a) verified end-to-end with a real cross-branch sale through the real checkout flow, then properly voided (not hard-deleted) for cleanup.
  - One instance of this project's previously-documented stale-render flake (a navigation not immediately reflecting in `get_page_text`) — resolved on retry, consistent with the project's own noted precedent, not a real defect.
  - One dev-server environment snag: the dev server on port 3000 was unresponsive again this session (same crashed-RSC-worker class as Phase 19.2/30.2); the already-running healthy instance on port 3001 was used throughout.

## Findings not fixed this phase (logged for a future, properly scoped phase)

| Finding | Severity | Recommended next step |
|---|---|---|
| Roles page/components still on pre-Phase-21 design system | Important | A design-rollout tranche, same shape as Phases 27/28 — this is now the last fully-unstyled screen in the app. |
| Seminars module still on pre-Phase-21 structural treatment | Important | Same tranche as above, or its own — newly discovered, not previously tracked anywhere. |
| 8 isolated `rounded-md` buttons in otherwise-current files | Minor | Trivial fix, can ride along with whichever phase next touches any of those four files. |
| Sales Log shows raw `cashierUid` instead of a resolved name | Important | Small, well-scoped fix — reuse the name-resolution pattern `getSaleDetail.ts` already established. |
| TD-4 (deleted staff → unreachable conversations) | Tracked, not new | Still open, still deliberately deferred pending a product decision — see Task 1.4 above. |
| TD-5 (deactivated staff remain messageable) | Tracked, not new | Still open, still deliberately deferred, low risk — see Task 1.4 above. |

## Outstanding items

- The six findings above are the accurate, current map of what's left — this phase's explicit purpose per its own brief, rather than an attempt to resolve everything in one pass.
- CLAUDE.md's design-system-coverage note should be updated to add Roles and Seminars to "still unstyled," and to drop the stale claims about `IntakeSection.tsx` and the Sales Log list.
- Committed (`47589bc`) and tagged `phase-33-baseline`, per explicit user request.
