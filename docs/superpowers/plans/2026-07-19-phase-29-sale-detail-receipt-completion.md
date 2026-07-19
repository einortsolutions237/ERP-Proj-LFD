# Phase 29 (Sale Detail View & Printable Receipt) — Completion Report

**Status: complete. Final whole-branch review — Ready to merge: Yes. Live verification performed and passed (browser reachable a third phase in a row).**

Plan: `docs/superpowers/plans/2026-07-19-phase-29-sale-detail-receipt.md`
Range: `5d1a512..58878cf` (2 commits, one per task)

## What shipped

A sale detail view (line items, discount/tax/total, full payment breakdown with reference codes, linked customer, branch, cashier, timestamp, void status, this-sale's pending deliveries) and a printable receipt reachable from it, plus one real bug fix folded in along the way.

**Investigation before implementation found the detail page already existed** at `pos/sales/[id]/page.tsx` (pre-design-system, linked from the Sales Log's "View" column) — but with a real, live branch-scoping bug: it 404'd any org-wide role (`super_admin`) trying to view a sale from a branch other than their own, unlike the Sales Log list itself (fixed in Phase 20 via `isBranchLocked`). Since this phase touched that exact file for new functionality anyway, the fix was folded in rather than re-flagged and deferred, per this project's Known-issues policy.

**Task 1** — `src/lib/pos/getSaleDetail.ts`, a new data helper resolving a raw `sales` doc into a display-ready shape: branch/customer/cashier/product/voidedBy names resolved with graceful fallback to the raw ID when a doc is missing, ISO date strings instead of Firestore Timestamps, and this sale's own `pendingDeliveries`. Branch-scoping uses `isBranchLocked(viewer.role)` — the fix — matching `GET /api/sales`'s Phase 20 pattern exactly. No new capability: `pos.sale.view` roles (`super_admin`/`branch_manager`/`cashier`) are a strict subset of `pos.delivery.fulfill` roles, so showing this-sale's pending deliveries needed no additional gate. `seedSale` test fixture extended backward-compatibly (new fields all optional, existing defaults unchanged). 9 new emulator-backed tests.

**Task 2** — full rewrite of the detail page onto this project's established design tokens, consuming the new helper; a print-only receipt block (`hidden print:block`, plain black-on-white, structurally distinct from the on-screen table — not the same table with colors stripped) reachable via a new `PrintReceiptButton.tsx` client component (`window.print()`, no new library, no server-side PDF generation); three additive `print:` className edits to the shared `NavShell.tsx` so the sidebar/header don't appear when printing.

No changes anywhere to `api/sales/route.ts`, the void route, `SalesTable.tsx`, or the Sales Log list page — all confirmed absent from the diff by both task reviews and the final review.

## Review summary

Both tasks reviewed clean, zero Critical/Important findings. Task 1 (Opus tier, given it fixes a security-relevant branch-scoping bug — this project's most-repeated bug class) had the fix independently re-verified against the live `isBranchLocked`/`BRANCH_LOCKED_ROLES`/`CASHIER_BRANCH_MGR` constants, not just trusted from the brief. Task 2 (Sonnet tier) had `NavShell.tsx`'s three edits explicitly checked hunk-by-hunk as a named cross-cutting risk (that file wraps every page in the app) and confirmed purely additive — no structural or prop change.

**Final whole-branch review (Opus): Ready to merge — Yes.** Independently re-confirmed the branch-scoping fix is airtight (including the `inventory_manager`-is-branch-locked-but-lacks-`pos.sale.view` interaction, which cannot bypass anything since the capability gate runs first), zero field-name drift between Task 1's `SaleDetail`/`SaleDetailPendingDelivery` types and Task 2's consumption of them, all null/empty cases guarded at the consumer, and print separation sound (confirmed `NotificationBell` inside the header is hidden too, not just the sidebar). Two Minor notes carried from the task reviews (mobile drawer lacks `print:hidden`, not one of the three named edits; on-screen/print blocks intentionally duplicate line-item rendering since they're genuinely different layouts) plus one new Minor (the helper's internal `AuthError` recheck sits outside the page's try/catch — currently unreachable given call order, documented belt-and-suspenders consistent with `getPendingDeliveries`/`getAppointments` precedent). None needed a fix.

## Verification

**Automated:** `npm test` — 479/479 passing (470 + 9 new), zero regressions.

**Live verification — full pass, real `erp-lfd` data.** Sessions minted via real Admin-SDK custom-token exchange against the real Identity Toolkit API (not the emulator), signed in through the actual `POST /api/auth/session` endpoint — a genuine login flow, not a manually injected cookie (the session cookie is `httpOnly`, so this was the only route available, which also happens to exercise the real endpoint end-to-end). 6/6 checks:

1. Cashier viewing an own-branch sale (with a real pending delivery) — branch/cashier/customer names resolved, line items/totals/payments correct, pending-deliveries table showing the real product name and status.
2. Same cashier attempting a foreign-branch sale — real 404, confirmed via screenshot with the cashier's identity visible in the header (no data leak).
3. **`super_admin` viewing that same foreign-branch sale — the headline bug-fix check — succeeded** (previously would have 404'd), including a real split cash + MTN MoMo payment with reference code `PHASE25-VERIFY` (real historical Phase 25 data). One transient stale-render flake on the first load (page briefly showed the prior page's content immediately post-navigation) — the same known session-cookie-swap timing race this project's history has hit before (Phase 19, Phase 28), not a defect; resolved on the very next read, confirmed by both a follow-up `fetch()` and a screenshot showing the correct real content.
4. A voided sale as `super_admin` — Voided badge, "Voided ... by Super Admin — phase20 void test" (real Phase 20 historical data) rendered correctly, no Void button shown.
5. The print-only receipt block — inspected via DOM/computed-style rather than by clicking the actual Print button (which opens a native OS-level print dialog that risks blocking further browser automation, per this session's browser-safety constraints). Confirmed `display: none` on screen with complete, correctly-formatted content (LFD Services header, real branch name, VOIDED marker, line items, totals, payment with the null reference correctly omitted, cashier line, customer line correctly omitted when null) while the on-screen block remained visible.
6. `NavShell.tsx` print-hiding — header and sidebar wrapper both confirmed to carry `print:hidden`, `<main>` confirmed to carry the three print-reset classes, exactly as specified.

## Outstanding

- Nothing outstanding from this phase's own exit criteria — all five are met and live-verified.
- The actual browser-native print/Save-as-PDF dialog itself was not clicked (see item 5 above) — deliberate, for automation-safety reasons, not a gap in the underlying CSS, which was verified directly. Worth a manual human click-through at some point if visual confidence in the literal print dialog's paper layout is wanted, but not blocking.
- `SalesTable.tsx`/Sales Log list remain on the pre-design-system convention, as scoped — a candidate for a future design-rollout tranche alongside `IntakeSection.tsx`, messaging, and Roles.

Tag `phase-29-baseline` not created — per this project's tag-on-request-only practice.
