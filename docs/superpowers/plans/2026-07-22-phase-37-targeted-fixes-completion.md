# Phase 37 — Targeted Fixes from Phase 36's Assessment — Completion Report

**Date**: 2026-07-22
**Status**: Complete. All six planned fixes shipped, plus two review-driven follow-ups (both user-approved before being built). Final whole-branch review: Ready to merge = Yes, zero unresolved Critical/Important findings.

## Summary

Executed via `superpowers:subagent-driven-development` — a fresh implementer subagent per task, a fresh task-scoped reviewer per task, and a final whole-branch review on Opus. Build (`npm run build`) and tests (`npm test`, 511/511) independently re-confirmed by the controller after all tasks landed, not just taken from subagent reports. No business logic, capability gating, schema, or data-model change anywhere in this phase, matching the plan's own exit criteria.

## Task 1 — POS out-of-stock/low-stock visibility

`src/app/(dashboard)/pos/page.tsx` now fetches `reorderThreshold` alongside every product; `CheckoutForm.tsx` renders a distinct "Out of stock"/"Low stock" pill in search results (mutually exclusive, using the shared `isLowStock` helper — CLAUDE.md's own repeat-mistake warning against reinventing that comparison inline) and a persistent "Backorder" pill on any cart line whose quantity exceeds the stock snapshot taken when it was added. Service lines are structurally excluded from backorder logic. Reviewed clean, zero findings. Live-verified against real `erp-lfd` data (a genuine qty-0 product, a genuine low-stock product, no pill on a normal item).

## Task 2 — Offline-sync recovery popover

`QueueStatusIndicator.tsx`: Esc now closes the panel via a `document`-level listener regardless of where focus is (the old handler only worked if focus happened to be inside the panel's own subtree); click-outside closes it via a `containerRef` + `document` mousedown listener; the panel moved from a button-anchored `absolute` dropdown (which structurally overlapped the Checkout page's Customer card directly below it) to a viewport-anchored `fixed bottom-4 right-4` corner panel; the one specific, well-defined rejection reason (`'A sale with a backordered item must have a customer attached'`, thrown verbatim by `api/sales/route.ts:213`) now maps to plain-language copy, with every other rejection reason still falling back to its raw message rather than being swallowed. Reviewed clean, zero findings. Fully live-verified — a real `needs_attention` sale was produced through the real 409 path and all four sub-fixes confirmed live.

## Task 3 — Dashboard branch-name resolution

New `src/lib/branches/getBranchName.ts` (single-doc lookup mirroring `pendingDeliveriesSummary.ts`'s exact pattern, not the bulk-scan pattern) resolves the Dashboard header's `Branch:` line to a real name instead of the raw Firestore document id two sibling widgets on the same page already correctly showed. TDD: real RED (module-not-found) confirmed before the implementation existed, real GREEN (2/2) after. Reviewed clean, zero findings. Live-verified.

## Task 4 — Silent permission-denial banner

Every one of this app's ~40 capability-gated pages redirects to `/dashboard?error=not-authorized` on denial; the Dashboard page never rendered that param. It now accepts `searchParams` (matching this codebase's existing `Promise<{...}>` convention exactly) and shows a `role="alert"` banner when `error === 'not-authorized'`. Landed cleanly on top of Task 3's same-file change with no conflict, confirmed by the task reviewer reading the final file state directly. Reviewed clean, zero findings. Live-verified both the with-param and without-param cases.

## Task 5 — WCAG AA contrast fix for `success`/`warning` tokens

`--color-success`/`--color-warning` changed from `#16a34a`/`#d97706` to `#166534`/`#92400e` (Tailwind green-800/amber-800) — `--color-danger`/`--color-info` untouched. New `tests/unit/colorContrast.test.ts` proves both new values clear 4.5:1 against plain page background and against the tightest real usage in this app (a `/10`-opacity self-tinted badge, lighter than plain paper) — independently re-derived by the task reviewer via hand computation, not just trusted. Implementer grepped all 21 files using these two Tailwind classes and confirmed no solid-background/light-text usage exists anywhere (only small status dots use a solid fill; every piece of text sits on a light tint) — independently reproduced by the reviewer with a second, differently-scoped grep.

**Review-driven follow-up**: the first review found the contrast test hardcoded its target hex values instead of reading `globals.css`, so it proved the math but gave zero actual regression protection. Flagged to the user as plan-mandated (my own plan specified this exact hardcoded-value approach); the user asked for the real fix. A follow-up commit made the test parse `--color-success`/`--color-warning` directly out of `src/app/globals.css` via a scoped regex, throwing loudly if a token is missing, with a genuine revert-and-confirm-fail proof (reverted to the old value, confirmed 2/4 assertions correctly failed, restored, confirmed 4/4 passed again) — the re-review independently re-derived the same failing contrast number and confirmed the fix is real. Both reviews clean, zero unresolved findings.

One honest, well-mitigated live-verification gap: the implementer couldn't visually re-check 4 additional badge tables (Products/Staff/Departments/Branches) without switching to an account whose password it would have had to type — correctly declined per this project's standing rule against handling real credentials. Mitigated with a direct source read confirming byte-identical Tailwind classes to what *was* visually verified, independently re-confirmed by the reviewer reading all four files directly.

## Task 6 — Leftover QA test customer cleanup

New `scripts/phase37-cleanup-test-customers.ts` (standalone, mirrors `scripts/seed.ts`'s convention, not reachable from any app code path) investigates before acting: checks all five TD-3 never-delete collections (`sales`/`treatments`/`appointments`/`labOrders`/`seminarAttendance`) for each named test customer and only proceeds to delete if all five come back empty. Reviewed clean — the blocking logic is exhaustive and structurally cannot reach a delete once a blocker is found, confirmed by direct code-path tracing in both the task review and the final whole-branch review.

**Actual outcome against real `erp-lfd`: both target customers came back BLOCKED, not deleted.** "Lab Test Only Customer" (`tcjuA9fEe8YZfXC9iN2C`) is referenced by 5 real `labOrders`; "Phase 18 Verification Customer" (`ZTWFMTRLoHapaIQPWAu3`) by 1 real `sales` doc. Neither was touched — the script worked exactly as designed by refusing to force a deletion this app's architecture permanently forbids. This meant the plan's own exit criterion ("both records gone") could not be met as written. A third, out-of-scope test customer ("Phase 18 TD-3 Isolation Customer") was incidentally discovered and correctly left untouched.

**User-directed follow-up**: told of the blocked outcome, the user chose to exclude the two non-deletable customer ids from the checkout-time pickers instead of deleting the underlying records. New `src/lib/customers/pickerExclusions.ts` (a shared, two-id constant) is now checked in exactly the two places a real cashier can pick a customer mid-sale — `pos/page.tsx`'s direct query and `GET /api/customers` (confirmed, independently, to be the *only* consumer of which is `QueueStatusIndicator.tsx`'s offline-queue attach-customer flow) — while the full customer management page, appointment/seminar customer pickers, and the customer docs themselves remain fully untouched and fully visible. Reviewed clean. Live-verified: both hidden from the POS picker, a real customer still appears normally, both still fully visible on `/customers`.

**The original Phase 36 mis-click risk is now genuinely closed** — the two records remain in `erp-lfd` (by design, since deleting them is structurally impossible), but neither is reachable during an active sale anymore.

## Final whole-branch review (Opus)

Ready to merge = Yes, zero Critical/Important findings. Specifically confirmed: Tasks 3 and 4's sequential edits to `dashboard/page.tsx` coexist correctly on a full-file read (the `Promise.all` array, `searchParams`, `branchName`, and the new banner are all structurally sound together); the two customer ids in Task 6's investigation script and Task 6b's exclusion list are identical strings in both places; Tailwind v4 resolves badge colors from the current CSS variable at build time, so Tasks 1/2 adding badge markup before Task 5 darkened the tokens is a non-issue; Task 6's script is standalone and unreachable from any app code path. Two Minor, non-blocking notes: (1) `pickerExclusions.ts`'s two hardcoded ids have no compile-time link back to the customer names they're meant to represent — a typo would silently exclude the wrong customer, mitigated operationally by the live-verify step already performed, not by the type system; (2) `getBranchName`'s Firestore read has no try/catch, so a transient read failure would error the whole Dashboard rather than gracefully falling back to the raw `branchId` the way it already does for a genuinely-missing doc — low blast radius (a single-doc read added to a page that already makes several), noted as an optional future robustness improvement, not requested as a fix for this phase.

## Verification

- `npm test`: 511/511 passing, independently re-run by the controller after all tasks landed (not just taken from subagent reports).
- `npm run build`: clean, independently re-run by the controller.
- All six fixes plus both follow-ups live-verified against real `erp-lfd` data, mostly via `claude-in-chrome` browser automation (which connected successfully throughout this phase — no recurrence of the connection failures noted in several earlier phases), with one instance (Task 5's four additional badge tables) substituted with direct source verification instead, for the credential-handling reason above.

## What's next

Phase 38 (per Phase 36's own plan): the broader visual/responsive pass, plus resolving the `resize_window` verification-tool gap (this project has now hit that identical failure twice, Phases 24 and 36) before any responsive-specific fix from that phase can be claimed verified. Nothing from this phase (37) blocks it.
