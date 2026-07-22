# Phase 36 — UI/UX Assessment (Impeccable audit + critique) — Completion Report

**Date**: 2026-07-22
**Status**: Complete. Assessment only — no fixes applied beyond account cleanup. Zero application code changed.

## Scope

Ran Impeccable's `critique` (UX/heuristic review) and `audit` (accessibility, performance, responsive) methodology against 5 representative screens: Login, Dashboard, POS/Checkout (including the inline customer picker as the form-heavy example), and Products (data-dense table). Per the phase brief, this was a representative sample, not a full-app sweep, and produced findings only — no shadcn/ui reconsideration, no restyling, no business-logic changes.

## Method

Per Impeccable's hard invariant that Assessment A (design review) and Assessment B (detector/browser evidence) must run as two isolated sub-agents, not inline: dispatched two fresh, non-fork `general-purpose` agents in parallel, each with no visibility into the other's work or findings, consistent with Phase 31's own corrected practice (Phase 31's Module 1 used forked agents and leaked cross-agent state; this phase used fresh agents throughout).

Two disposable synthetic test accounts (`branch_manager`, `general_manager` — created via direct Admin SDK calls, CSPRNG passwords, deleted immediately after this phase) were created against real `erp-lfd` data to reach all 5 screens, since no single non-`super_admin` role covers Dashboard + POS + Products together (`pos.sale.create` and `inventory.catalog.manage`/`admin.staff.view` are held by disjoint role sets per `permissions.ts`).

**Report header provenance**: dual-agent (Assessment A and Assessment B ran as two independent, isolated background agents; neither had access to the other's findings or this conversation's context).

## Responsive Verification — genuine, and genuinely limited

Per the phase's own highest-priority instruction, given this project's documented history (Phase 24) of a resize tool reporting success without changing anything: **the orchestrator and Assessment B independently attempted real viewport verification, in two separate browser sessions, and both got the identical negative result.** `resize_window` was called with 768×1024 and separately 390×844; both calls reported success; `window.innerWidth`/`window.screen.width` never changed from 1536 (the OS display width) in either session, confirmed via `javascript_tool`, not by trusting the tool's own return message.

**No rendered mobile/tablet screenshots exist for this assessment.** This is stated plainly rather than papered over, per the phase's explicit instruction. In its place, both the orchestrator and Assessment B independently performed a structural code review of Tailwind responsive classes across all 5 screens and their components — this is real, but it is code review, not rendered verification, and is labeled as such throughout. No hardcoded fixed-pixel widths, no un-wrapped wide tables, and no missing mobile-stacking variants were found in any of the 5 screens or their directly-referenced components (NavShell's mobile drawer, CheckoutForm's `md:` breakpoint stacking and mobile sticky-bottom action bar, Dashboard's `md:grid-cols-2`, Products' `overflow-x-auto` table wrapper). This code reads as genuinely mobile-first in intent — but that claim is unverified by an actual rendered viewport, and should not be treated as equivalent to Phase 24's later live click-through confirmation of the same mobile drawer, which also never actually happened (Phase 24 hit the identical tool failure).

## Findings

No Critical (task-blocking) findings in either assessment.

### Important

1. **Out-of-stock items are visually indistinguishable from in-stock items in POS/Checkout.** A `qty 0` product renders pixel-identical to a fully-stocked one in both search results and the cart. Since this app's backorder model (Phase 18) lets a sale complete against zero stock as a customer IOU, a cashier gets zero visual signal they're creating one. Confirmed live by Assessment A (added a real qty-0 item to a cart under deliberate stress-testing).
   *Suggested*: distinct color/icon/label on qty-0 (and low-stock) rows in search results, plus a persistent "Backorder" badge on the corresponding cart line. Candidate for Phase 37 (this is a visual/UX treatment, not new business logic — the backorder state already exists and is already returned by the API).

2. **The offline-sync "needs attention" recovery popover cannot be dismissed, and overlaps its own fix control.** Triggering a real walk-in-without-customer rejection (Phase 18's backorder-without-customer 409) surfaced a popover reading "Server accepted the sale but returned an unreadable response" — self-contradictory copy for a cashier to act on — with "Press Esc to close" printed on it, but Esc did not close it, clicking outside did not close it, and it persisted across a full "Start new sale" reset, overlapping part of the Customer card it was directing the user toward. Confirmed reproducible three separate ways by Assessment A.
   *Suggested*: fix Esc/click-outside dismissal, reposition so it never overlaps the control it references, replace the copy with a plain instruction ("This sale needs a customer attached — search or add one below"). Candidate for Phase 37 — this is a real bug in existing UI code (Phase 18.1's sync engine), not a design preference.

3. **A raw Firestore document ID is shown as the user's own branch name on the Dashboard's first line.** "Branch: H5Rn9e7PsVYrYG6gqdJy" appears directly under "Welcome," while two widgets on the identical page correctly render "LFD Services — Downtown Branch" from the same underlying data. A same-screen consistency failure at the single highest-visibility moment in the app. Confirmed live by Assessment A.
   *Suggested*: resolve `branchId` through the same lookup the Low Stock/Pending Deliveries widgets already use. Small, isolated, high-value fix — good Phase 37 candidate.

4. **A permission-denied redirect is silent.** Navigating a role that correctly lacks `inventory.stock.view` to `/stock` redirects to `/dashboard?error=not-authorized` — the query param is present in the URL but nothing renders it. The user just lands back on Dashboard with no explanation. Confirmed live by Assessment A.
   *Suggested*: render the `error` query param as an actual banner/toast on arrival. Candidate for Phase 37.

5. **Systemic WCAG AA text-contrast failure on `success`/`warning` tokens, now measured with hard numbers.** Both assessments independently found and quantified this: 3.04–3.30:1 (need 4.5:1) across Dashboard's pending-deliveries count, POS Checkout's total, and Products' active-status badge. Root cause confirmed in `globals.css` lines 11/13 — raw Tailwind 600-weight hex values never contrast-checked against this app's lighter neutral palette. **This is not a new finding** — CLAUDE.md's own Phase 31 note already names this as deferred, app-wide, out of any single module's scope. This phase adds concrete measured ratios across 3 additional screens/roles to that existing record; it does not change the deferred status. Worth a real decision (see "Needs your decision" below) on whether Phase 37/38 finally takes this on, since it keeps resurfacing every time a new audit touches these tokens.

6. **The live customer picker in Checkout contains leftover QA test data as selectable options** ("Lab Test Only Customer", "Phase 18 Verification Customer") — a real cashier could select either by mistake. This is a data-hygiene issue, not a code defect, but it's exactly the kind of "leaked internals" the product register's trust bar warns about (Assessment A's phrasing: not surface template-genericness, but "leaked internals eroding confidence in the data itself"). Flagged for a decision, not a fix — see below.

### Minor

1. Touch targets: a universal, uniform ~2–4px shortfall on every text input measured (41.6–42px vs. the 44px reference), with larger shortfalls on Sign out (34px), Check In (36px), and product-search/customer-picker list rows (40–41px). Notably inconsistent even within `CheckoutForm.tsx` itself — its own cart +/−/remove buttons correctly use `min-h-11 min-w-11` (44px) while the adjacent search-result rows on the same screen don't. (Assessment B, measured via `getBoundingClientRect`.)
2. Login page has zero landmark regions (no `<main>`/`<nav>`/role attributes), unlike the rest of the authenticated shell which correctly provides them plus a skip-to-content link. (Assessment B.)
3. Login input/card border contrast measures 1.18:1 (`border-mist` on `bg-paper`) — well under the 3:1 WCAG 1.4.11 guideline for meaningful UI boundaries, though soft in practical impact since the field's near-white fill still reads as distinct. (Assessment B, measured.)
4. Cart line-item names truncate even when visible slack space exists in the row ("Bottled Water 500ml" → "Bottled Water …"), on the one screen where confirming cart contents matters most; the only fallback is a slow, undiscoverable native tooltip. (Assessment A, live-confirmed.)
5. Products table has no responsive column-hiding, relying solely on horizontal scroll on narrow viewports — a reasonable, common strategy, flagged only as an enhancement candidate, not a defect. (Assessment B, structural review.)
6. The same test-account email is displayed twice within 150px on every authenticated page (top bar + "Welcome, {email}"). (Assessment A.)
7. Dashboard's Recent Activity feed shows raw emails instead of resolved staff names — the same class of raw-identifier leak as Important Finding 3, lower visibility. (Assessment A.)
8. Login's form is anchored top-left of a mostly-empty viewport rather than centered — unusual for the surface type, low-stakes for an internal tool. (Assessment A.)
9. Sidebar nav label reads "New Sale" while the page's own H1 reads "Checkout" — a small mismatch, low-impact since it's the app's only POS entry point. (Assessment A.)

### Positive findings (both assessments independently confirmed these — worth protecting, not touching)

- The design-token system (marine/brass accents, tinted payment-method cards, the text-link Edit/Delete convention, `rounded-2xl`/`shadow-card`) is genuinely disciplined and consistent across all 5 screens.
- Keyboard focus indicators are real and consistently applied (`:focus-visible` marine ring; zero `outline-none`/`outline: none` suppressions found anywhere in `src/`).
- Label association is complete across every audited form field, confirmed via direct DOM lookup, not eyeballing.
- The POS search-to-cart Enter-key accelerator (Phase 32's fix) is correctly scoped — fires only on an unambiguous single match, correctly no-ops on an ambiguous one — confirmed live under deliberate stress-testing by both assessments independently.
- Zero hardcoded hex colors or inline-style color bypasses of the token system in any of the 4 audited source files.
- No performance red flags; Recharts is used correctly (`ResponsiveContainer`, no oversized fixed canvas); this app has no product photography, so lazy-loading is moot.
- The CLI anti-pattern detector (`detect.mjs`) returned **zero findings** across all 5 files — no AI-slop tells anywhere in this codebase's Tailwind usage.
- No narrow hard-to-hand-build interaction primitive (combobox, date-picker) was found in any of the 5 screens — the shadcn/ui question was re-examined with real evidence this phase and remains correctly not needed.

## Overall Heuristic Score (Assessment A)

22/40 — **Acceptable**: solid foundation, several concrete gaps concentrated at the highest-stakes moments (checkout completion, permission denial), not a broad quality problem. Full 10-heuristic breakdown is in Assessment A's own report (available on request); the lowest scores were Help & Documentation (0 — no contextual help anywhere in the app) and three heuristics tied at 2 (Match Between System/Real World, User Control and Freedom, Error Prevention, Error Recovery), each traceable to one or more of the Important findings above.

## What this sets up for Phase 37/38

Per this phase's own brief, nothing beyond disposable-account cleanup was fixed — every finding above is logged for a future phase to execute, the same discipline Phase 33's self-audit held for Phase 34. A natural split:
- **Phase 37 (targeted fixes)**: Important findings 1–4 (backorder visibility, popover dismissal, branch-ID resolution, silent permission-denial banner) are all small, isolated, code-level fixes to existing screens — no new capabilities, no schema changes.
- **Phase 38 (broader visual/responsive pass)**: the Minor findings, plus a real resolution to the responsive-verification gap (a different tool, a real device, or manual user confirmation) before claiming any responsive fix is actually verified rather than just written.

## Decisions (confirmed with the user, not decided unilaterally)

1. **The `success`/`warning` WCAG contrast fix (Important #5)** — **decided: Phase 37/38 fixes it.** Surfaced independently in Phase 31 and Phase 36; hard measured numbers now exist across 3 screens, judged sufficient to act on rather than defer a third time.
2. **The leftover QA test customers in the live customer picker (Important #6)** — **decided: clean up.** Unlike this project's other kept-in-place test data (Phase 13's test customer, Phase 26's test expense), these are reachable from a real cashier's normal checkout flow — a genuine mis-click risk, not inert junk data.
3. **The responsive-verification tool gap** — **decided: Phase 37/38 must resolve the verification method itself (real device, different automation tool, or manual user check) before any responsive-specific fix from this findings list can be marked verified.** This project has now hit the identical `resize_window` failure in two separate phases (24 and 36); a third instance of false confidence is explicitly to be avoided.
