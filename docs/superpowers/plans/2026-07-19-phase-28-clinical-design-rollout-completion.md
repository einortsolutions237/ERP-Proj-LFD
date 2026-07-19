# Phase 28 (Clinical Module Design Rollout — Customer-Page Sections) — Completion Report

**Status: complete. Final whole-branch review — Ready to merge: Yes. Live verification partially performed (browser reachable a second phase in a row; doctor role confirmed live, nurse negative-check did not complete due to a session-timing race and remaining context budget — see Outstanding).**

Plan: `docs/superpowers/plans/2026-07-19-phase-28-clinical-design-rollout.md`
Range: `639fc3a..6f27cd9` (4 commits, one per task)

## What shipped

Extended established structural conventions to the five clinical-adjacent sections on `customers/[id]/page.tsx` — this app's most capability-gated file (a 5-element `requireAnyCapability` page-level gate plus 12 independent `hasCapability` booleans). **Real scope was 7 files, not the 2 named in the brief** — found by reading the render tree first, as instructed: appointments render inline in `page.tsx` (not a component), lab is a separate `LabSection.tsx` (not inside `ClinicalSection.tsx`), and three popup sub-forms (`TreatmentForm.tsx`, `LabOrderForm.tsx`, `LabResultForm.tsx`) needed matching treatment so a section's form wouldn't look broken next to its restyled table.

Three status/flag fields, already fetched, converted from plain text to tint badges: appointment status, lab order status, lab result flags, and delivery status — no new query or capability check anywhere in the diff.

`IntakeSection.tsx` (Patient demographics + Nursing visits) — a sixth section on the same page, same old convention, not among the five named — was flagged and deliberately left untouched, confirmed absent from the diff by the final review.

## Review summary

All 4 tasks reviewed clean, zero Critical/Important. Task 1 (the page-level appointments section, Opus tier per the plan's explicit request) got an exhaustive 13-gate comparison — every capability check independently confirmed byte-identical via hunk-boundary inspection, not the implementer's self-report. Two transient infrastructure hiccups during the session (one reviewer dispatch hit an API stream-timeout, one implementer dispatch hit a network error mid-run) were handled by re-dispatching/directly verifying rather than blindly retrying — in the second case, the commit had already landed correctly before the drop, confirmed by reading the file and running `tsc` directly before re-review.

**Final whole-branch review (Opus): Ready to merge — Yes.** Re-verified all 7 binding constraints directly from the diff hunks (not the task reviews' summaries) given this file's sensitivity. Confirmed the four restyled sections' card/badge class strings are byte-identical across all of them — no Phase-22-style drift. Confirmed `IntakeSection.tsx` and its sub-forms are genuinely absent from the diff. Two Minor, pre-authorized-in-the-plan observations, neither needing action.

## Verification

**Automated:** `npm test` — 470/470 passing, zero regressions (no new application-code tests, presentation-only).

**Live verification — partial.** Browser automation was reachable for a second consecutive phase. Confirmed live against a real patient with real data, as `doctor`: Clinical record card/table, Lab orders section (real "ordered"/"completed" status badges, a real "high" result flag), Seminar attendance and Upcoming appointments empty states, "Add treatment"/"Order lab test" buttons — all rendering correctly with the new styling. A `nurse`-role negative-check (should see only lab, not treatments/appointments) hit a session-timing race (the page rendered stale content immediately after a session-cookie swap — the same class of flake this project's verify skill already documents) and was not completed, given remaining context budget in this session. This is a lower-risk gap than it would otherwise be: Task 1 and Task 2's diff-level reviews already independently confirmed zero capability-logic changes anywhere in this phase, so the nurse boundary's *correctness* was verified by code inspection even though its *live rendering* wasn't re-confirmed visually.

## Outstanding

- **Live nurse/protocol/lab_staff negative-checks not completed** — worth a quick follow-up pass next session, though the underlying capability logic is confirmed unchanged by code review.
- **`IntakeSection.tsx`** is the obvious next follow-up — same old convention, same page, not touched this phase.
- The final review recommends factoring the now-four-times-repeated badge/tone-map pattern into a shared helper once `IntakeSection.tsx` gets its own rollout, to prevent future drift.

Tag `phase-28-baseline` not created — per this project's tag-on-request-only practice.
