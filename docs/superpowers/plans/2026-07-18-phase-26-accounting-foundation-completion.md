# Phase 26 (Accounting Foundation) — Completion Report

**Status: complete. Zero application-code changes needed after task-level implementation. Live verification performed and passed this session, via HTTP against the real dev server and real `erp-lfd` data (browser automation unreachable — see Outstanding).**

Plan: `docs/superpowers/plans/2026-07-18-phase-26-accounting-foundation.md`
Range: `d9b1bf8..1a1c94b` (6 implementation commits, one per task, plus a follow-up index fix; plan doc committed separately as `7b29a76`)

## What shipped

`finance_admin`'s first substantial feature set since Phase 1: expense tracking and a gross, pre-tax P&L report — deliberately with no chart of accounts, no debit/credit ledger, and no tax logic anywhere.

- **Data model & capabilities (`d9b1bf8`)** — new `Expense` type (`date`, `category`, `amount`, `description`, `branchId`, `recordedBy`, `createdAt`; no `updatedAt`, no edit/delete route by design), `expenses` fully closed in Firestore rules (all access via `/api/expenses`). Three new capabilities follow this project's established create/view split: `accounting.expense.create` (`super_admin`/`finance_admin` only), `accounting.expense.view` and `accounting.pnl.view` (both `super_admin`/`finance_admin`/`general_manager` — view-only for `general_manager`, never create).
- **Expense recording (`4f9beb6`)** — `src/lib/expenses/store.ts` is the sole Firestore access point (`createExpense`/`queryExpenses`/`resolveExpenseBranchId`); `POST`/`GET /api/expenses`. Branch derivation reuses `POST /api/departments`' pattern verbatim: a branch-locked role's own `branchId` is used unconditionally, an explicit `branchId` is honored only for non-branch-locked roles and validated against a real `branches` doc. A plain `create()`, no transaction — a positive-amount record has no race-prone numeric field to protect, unlike stock.
- **P&L report (`1a86029`, index fix `12b1351`)** — `src/lib/reports/pnl.ts` reuses Phase 7's `buildSalesReport` **unmodified** for the revenue side (Net Income = Revenue − Expenses), so the P&L's revenue figure matches `/reports/sales` for the same branch/range by construction, not by a second implementation that could drift. Org-wide by default (no accounting role is branch-locked), with an optional `?branchId=` filter validated against a real `branches` doc, read straight out of `buildSalesReport`'s own `byBranch` breakdown. A composite index (`expenses(branchId, date)`) was added mid-task once the branch-filtered query needed it.
- **UI (`6d23be8`, `1108518`, `1a1c94b`)** — `/expenses` list page (with a "Record expense" link gated on `accounting.expense.create`), `/expenses/new` form, `/reports/pnl` page (date range + optional branch filter, revenue/expense/net-income tiles, expenses-by-category table), and two new Sidebar entries with new icons.

## Decisions confirmed during planning (see plan's own "Decisions made explicit" section)

- P&L visibility is org-wide-by-default with an optional branch filter, per the Phase 12 `isBranchLocked` pattern — no accounting role is branch-locked.
- No edit/delete route for expenses this phase; a correction/void flow is a reasonable near-term follow-up once `finance_admin` is actually using this, not built here.
- `accounting.pnl.view` maps to the `accounting` module (reserved since Phase 1, unused until now), not `reporting`.
- A pasted stale "updated CLAUDE.md" at this phase's kickoff (wrong Firebase project ID, undercounted shipped phases) was explicitly not used as a source of truth — the real on-disk `CLAUDE.md` (Phase 25, tagged `phase-25-baseline`) was used instead, consistent with this project's established practice for this recurring issue.

## Review summary

Per the plan, Tasks 1–3 (capabilities/rules, expense recording, P&L builder) each carried a request for Opus-tier review given their money-adjacent and revenue-figure-integrity stakes. Tasks 4–6 (UI, sidebar) were implemented directly. No Critical/Important findings surfaced during implementation.

## Verification

**Automated:** `npm test` — **458/458 passing, 12 test files, zero regressions** (grew from 442 pre-phase: +18 new tests — 13 in `tests/unit/permissions.test.ts` net gain from the phase's own 4 new capability-matrix assertions plus the pre-existing snapshot regenerated with 3 new capability columns, 7 in `tests/integration/expenses.test.ts`, 4 in `tests/integration/pnl.test.ts`). The suite run recorded at the end of Task 6 (`test-output.txt`, since deleted) was stale — it predated `expenses.test.ts`/`pnl.test.ts` even existing in the run; the number above is from a fresh run against the final code.

**Tax-logic grep** (plan's own literal check): `grep -rin "tax" src/lib/expenses src/lib/reports/pnl.ts src/app/api/expenses src/app/api/reports/pnl "src/app/(dashboard)/expenses" "src/app/(dashboard)/reports/pnl"` — one match, `"Net income (pre-tax)"`, a UI label only. No tax field, calculation, or rate logic anywhere in this phase's output.

**Live verification — performed via HTTP, not browser automation** (the Claude-in-Chrome extension would not connect this session; per explicit user decision, HTTP-level verification against the real dev server and real Firebase session cookies was used instead of deferring the step). Real session cookies were minted for `finance.admin@`, `test.gm@`, `test.admin@`, `ikeja.cashier@`, and `ikeja.manager@` (custom-token exchange, this project's established pattern since Phase 8) against real `erp-lfd` data:

- `finance_admin` recorded a real expense (`POST /api/expenses` → 201), saw it on `GET /api/expenses`, and the P&L for the covering date/branch (`GET /api/reports/pnl`) returned the exact category/amount and a correctly computed `netIncome`.
- Server-rendered HTML confirmed capability-gating at the page level (this app's `hasCapability` checks are entirely server-computed, so page HTML is a complete signal per this project's verify skill): `finance_admin`'s `/expenses` page shows the "Record expense" link and the new row; `general_manager`'s `/expenses` page shows the list but **not** the link; `general_manager`'s `/expenses/new` and `admin`'s `/expenses` both redirect to `/dashboard?error=not-authorized`.
- Capability boundary matrix, all confirmed live: `general_manager` — 403 on create, 200 on both views. `admin`/`cashier`/`branch_manager` — 403 on all three (create, expense view, P&L view).
- The `expense_create` audit-log entry was queried directly from `auditLogs` (not just trusted from the API's own response) — confirmed present, correctly attributed to the real `finance_admin` account, and carrying the full expense payload in `details`.
- **21/21 live-verification checks passed.**

The one synthetic test expense created during this verification (category `Verify-<timestamp>`, amount 123.45) remains permanently in `erp-lfd` — this phase deliberately ships no delete route for expenses, so unlike prior phases' synthetic test data (which was sometimes cleaned up or explicitly kept by decision), this one simply cannot be removed. Same precedent as Phase 13's synthetic patient record being kept by explicit decision — here it's structural, not a choice.

## Outstanding

- **UI-rendering-level live verification (actual browser click-through) was not performed.** The Claude-in-Chrome extension failed to connect for the entire session (same failure mode documented for Phases 21/22/23); per explicit user decision, HTTP-level verification against real data was substituted rather than leaving Task 7 Step 4 undone. Data correctness and every capability boundary are confirmed; visual layout, the actual form interaction, and click-through navigation are not. Worth a follow-up pass once the extension reconnects, same as Phase 21's outstanding item was eventually closed in Phase 24.
- A correction/void flow for expenses (flagged, not built, per the plan's own Decision 3) remains open, to reconsider once `finance_admin` is actually using this in practice.
- Payroll, chart of accounts, budget tracking, and multi-currency remain explicitly out of scope, unchanged from the plan.

Tag `phase-26-baseline` not created — per this project's tag-on-request-only practice.
