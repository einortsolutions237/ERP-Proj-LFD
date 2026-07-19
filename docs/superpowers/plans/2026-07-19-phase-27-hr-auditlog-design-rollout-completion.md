# Phase 27 (HR & Audit Log Design Rollout + Accounting/Payroll Consistency Check) — Completion Report

**Status: complete. Final whole-branch review — Ready to merge: Yes. Live/browser verification performed and passed — the first time browser automation has connected in six consecutive phases (21/22/23/26/26.1/27 — this is the first success).**

Plan: `docs/superpowers/plans/2026-07-19-phase-27-hr-auditlog-design-rollout.md`
Range: `7e1c5db..139bb66` (5 commits: one per style task, plus a real bug fix + its follow-up)

## What shipped

**Accounting/Payroll consistency check (exit criterion, performed and reported):** `/expenses`, `/expenses/new`, `/payroll`, `/payroll/new`, and `/reports/pnl` were read directly and grepped for every old-style class pattern this project's design rollouts have historically found. **Zero matches — already fully consistent with established conventions.** No changes made to any Accounting/Payroll screen this phase; the final whole-branch review independently confirmed none of those files appear anywhere in the diff.

**HR/Audit Log design rollout:**
- **My Leave + Review Leave (`16148c5`)** — `leave/page.tsx`, `LeaveRequestForm.tsx`, `leave/review/page.tsx`, `LeaveReviewButtons.tsx` all converted from raw pre-design-system Tailwind (`border-collapse`, `bg-black text-white`, `text-red-600`) to the established rounded-2xl/`--shadow-card` card-table idiom, plus a new status-tint badge for leave status (`pending`→warning, `approved`→success, `rejected`→danger, matching `StaffTable.tsx`'s existing active/inactive pill idiom).
- **Attendance (`a4c46a1`)** — same treatment, plus a status badge for `checked_in`/`checked_out` (success/slate) and `font-mono` time cells.
- **Audit Log (`2bf4449`)** — same table treatment, plus a genuinely new empty state (`AuditLogTable.tsx` had none before — the only screen in this phase's scope that lacked one).

**Zero behavior change across all three style commits** — confirmed by both task-level review (every reviewer checked hunk boundaries directly against `requireCapability` calls, Firestore query chains, `fetch()` bodies, and payload shapes, not just trusted implementer claims) and the final whole-branch review (which additionally confirmed the four screens' table/card class strings are byte-identical to each other, not just individually correct — explicitly ruling out the class-ordering drift Phase 22 once let through).

**A real bug, found live and fixed (`460cae3`, `139bb66`):** live browser verification of Audit Log crashed with a Next.js server error — "Only plain objects... can be passed to Client Components from Server Components" — because several audit actions (`expense_create`, `payroll_record_create`, etc.) snapshot a full record, including its own Firestore Timestamp fields, into `details` at write time; the Admin SDK returns those as `Timestamp` class instances on read, which can't cross the Server→Client boundary. This has been live and broken since Phase 26 started writing full-detail audit payloads — never caught because no prior session's browser verification ever reached this page with real Timestamp-bearing entries in it. Presented to the user mid-phase (fix now vs. log as tech debt); the user chose to fix it, since Task 3 had already touched this exact file. Fixed with a recursive `sanitizeTimestamps` helper that converts any Timestamp-shaped value (duck-typed via `toDate()`) to an ISO string before the row crosses the boundary — mirroring the field-by-field Timestamp-conversion discipline `leave/page.tsx`/`attendance/page.tsx` already use for their own known fields, generalized since `details`' shape isn't statically known. Confirmed live afterward: the page renders correctly with real data, including the session's own newly-created `leave_request_create`/`leave_request_approve` entries.

## Review summary

All 3 style tasks passed task-level review clean on the first pass, zero findings of any severity — described by reviewers as "byte-identical, mechanical application of the brief" with no deviation. The bug-fix commit was independently task-reviewed (Sonnet): Approved, zero Critical/Important, one Minor (the sanitizer only handles Timestamp-shaped values, not `GeoPoint`/`DocumentReference` — confirmed via `git grep` that this codebase writes neither into any `details` payload today, so the gap is real in the abstract but currently inert) — closed with a one-line code comment.

**Final whole-branch review (Opus): Ready to merge — Yes.** Confirmed all 5 binding plan constraints hold across every touched file. Explicitly compared all four screens' table/card class strings token-for-token (not just visually) and found them byte-identical — the exact drift class Phase 22 once let slip through individual task reviews did not recur here. Explicitly ruled out "changed behavior beyond the fix" for the Timestamp sanitizer by tracing key-order preservation, `undefined`-dropping, and null/falsy handling all the way through `JSON.stringify` and `AuditLogTable`'s own render logic — for any `details` payload with no Timestamp in it, the sanitized output is provably byte-identical to the original. Confirmed the bug fix was a legitimate, explicitly-authorized in-scope response to a real defect found during this phase's own verification, not a silent scope expansion. Three cosmetic Minor findings, none requiring action: a secondary-button border-radius/transition idiom that differs slightly from the primary-button idiom (present verbatim in the plan's own specified code), an inert `disabled:opacity-50` class on a plain GET-form submit button (harmless carryover from the shared button idiom), and the render-neutrality proof itself (a non-finding, recorded for the record).

## Verification

**Automated:** `npm test` — **470/470 passing, 13 test files, zero regressions**, both before and after the Timestamp-sanitizer fix. This phase adds no application-code tests (presentation-only, no component-rendering test framework in this project, same as Phases 24/25).

**Live verification — performed via real browser automation, not HTTP substitution.** The Claude-in-Chrome extension connected successfully this session, the first time in six consecutive phases (21, 22, 23, 26, 26.1 all failed to connect; this is the first success). Real session cookies were minted (`cashier`, `hr_admin`, `admin`, custom-token exchange) and driven directly through the actual UI against real `erp-lfd` data:

- **My Leave**: a real leave request was submitted through the form (type/dates/reason), and the resulting row rendered correctly in the new card-table with a "pending" badge in the correct amber/warning tint.
- **Review Leave**: the pending request appeared in `hr_admin`'s queue with the new marine "Approve" / danger-outline "Reject" buttons; clicking Approve → the "Confirm approve" review-note panel rendered correctly → confirming it succeeded and the request correctly disappeared from the pending-only queue afterward.
- **Attendance**: both the day-roster and history views rendered real data with correctly-toned `checked_in` (success/green) badges and `font-mono` time cells.
- **Audit Log**: initially crashed (the bug above), then — after the fix — rendered correctly with real data including the session's own newly-created leave-request audit entries, `details` visible and correctly formatted.

## Outstanding

None from this phase's own scope. Clinical module, messaging, and Roles remain the next tranches, explicitly out of scope per the phase brief and correctly not touched.
