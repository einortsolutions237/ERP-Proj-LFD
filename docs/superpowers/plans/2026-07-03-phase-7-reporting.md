# Phase 7 — Reporting & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sales/revenue report and a stock-levels report, both computed on demand from existing data (`sales`, `productStock`, `products`, `services`), with CSV export — no new collections, no writes anywhere.

**Architecture:** Two new read-only API routes aggregating existing collections in a single pass over the fetched docs (no Firestore aggregation queries, no new indexes expected — see Task 2/3's verification notes). CSV export is generated client-side from the same data already rendered, guaranteeing the file matches the screen by construction rather than by a second server-side computation that could drift.

**Tech Stack:** Unchanged — Next.js App Router, TypeScript, Tailwind, Firebase Admin SDK. No client-side Firestore reads, no Cloud Function (nothing is written, so there's nothing to react to).

## Global Constraints

- `api/sales/route.ts`, `api/stock/movements/route.ts`, `api/stock/transfer/route.ts`, and `api/leave-requests/*` are **not modified anywhere in this plan**.
- No new Firestore collections, no Firestore rules changes — reports read existing collections via the Admin SDK server-side, which bypasses client rules entirely (same as every other server-rendered list page in this app).
- Line-item `name`/`unitPrice` come from `sales.lineItems`'s own snapshot, never re-joined against current `products`/`services` — a later price/name change must not retroactively alter a historical report, same rule that already governs the sale record itself.
- The low-stock comparison (`quantity <= reorderThreshold`) must match `functions/src/lowStock.ts`'s exact comparison — defined once in `src/lib/inventory/lowStock.ts`, imported everywhere on the app side. `functions/` cannot import it (separate deployable/tsconfig) — that side stays as its existing inline comparison, unchanged.
- No TDD / no automated test suite — manual verification against exit criteria, matching Phases 1–6.
- Known issue check: `docs/tech-debt.md` TD-1 (thin audit detail) and TD-2 (low-stock quantity race) — this phase touches none of the files either involves. Left alone, re-flagged in the completion report.
- Dates: `startDate`/`endDate` query params are `'YYYY-MM-DD'` strings, parsed as UTC-day-boundaries (`T00:00:00.000Z` / `T23:59:59.999Z`) — the same documented-temporary UTC-only convention Phase 5 established for attendance dates. Default range when neither param is given: last 30 days ending today (UTC).

---

## Permissions (`src/lib/auth/permissions.ts`)

Add `'reporting'` to `MODULES` (a new module, same precedent as `pos`/`crm`/`hr` each getting their own rather than folding into an existing one — reporting is functionally distinct from the still-unbuilt `accounting` module, which stays reserved and untouched).

New role group — none of the existing ones fit (this is the first capability `finance_admin` gets since Phase 1 reserved the role with nothing mapped to it):
```ts
const REPORTS_ROLES: RoleId[] = ['super_admin', 'admin', 'branch_manager', 'finance_admin']
```

Add to `Capability` union and `CAPABILITY_MODULE` (module: `'reporting'`):
```ts
'reports.sales.view'      // REPORTS_ROLES
'reports.inventory.view'  // REPORTS_ROLES
```
Add both to `ROLE_CAPABILITIES` mapped to `REPORTS_ROLES`. Neither goes to `cashier`, `hr_admin`, or `it_admin` — confirmed by omission from `REPORTS_ROLES`.

---

## Shared helper — `src/lib/inventory/lowStock.ts`

```ts
// Must match functions/src/lowStock.ts's comparison exactly (quantityAfter
// <= reorderThreshold). That file is a separate deployable and can't import
// this — if this comparison ever changes, update both places, the same
// "keep in sync across an uncrossable boundary" situation firestore.rules'
// duplicated role lists are already in.
export function isLowStock(quantity: number, reorderThreshold: number): boolean {
  return quantity <= reorderThreshold
}
```

---

## `src/app/api/reports/sales/route.ts`

**`GET`** — `requireCapability('reports.sales.view')`.

Query params: `startDate`, `endDate` (both optional `'YYYY-MM-DD'`). Validate: if either is present, it must parse to a valid date (`isNaN(date.getTime())` check, 400 `{ error: 'startDate and endDate must be valid dates' }` if not); if both present, `endDate >= startDate` (400 `{ error: 'endDate must be on or after startDate' }` otherwise).

```ts
function defaultRange(): { start: Date; end: Date } {
  const end = new Date()
  end.setUTCHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)
  start.setUTCHours(0, 0, 0, 0)
  return { start, end }
}

function parseRange(startParam: string | null, endParam: string | null): { start: Date; end: Date } | null {
  if (!startParam && !endParam) return defaultRange()
  if (!startParam || !endParam) return null // both-or-neither; a lone param is treated as invalid input, 400 below
  const start = new Date(`${startParam}T00:00:00.000Z`)
  const end = new Date(`${endParam}T23:59:59.999Z`)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  if (end < start) return null
  return { start, end }
}
```

Query, branch-scoped for `branch_manager` (reuses the exact `(branchId, createdAt)` composite index already deployed for Phase 4's sales log — verify this holds in Task 2's manual check rather than assuming; Firestore can serve a pure range filter with either index field direction when there's no `orderBy` requirement, but confirm live since this project has been bitten by index assumptions before):
```ts
let query: FirebaseFirestore.Query = user.role === 'branch_manager'
  ? db.collection('sales').where('branchId', '==', user.branchId)
  : db.collection('sales')
query = query.where('createdAt', '>=', start).where('createdAt', '<=', end)
const snap = await query.get()
```

**Single-pass aggregation** over `snap.docs` (each doc cast to the existing `Sale`/`SaleLineItem`/`SalePayment` types from `src/lib/types/sale.ts` — read that file if you need the exact field names):

```ts
let revenueTotal = 0, nonVoidedCount = 0, voidedCount = 0, voidedTotal = 0
const byBranch = new Map<string, { revenue: number; count: number }>()
const byPaymentMethod = new Map<string, number>()
const byItem = new Map<string, { type: 'product' | 'service'; name: string; quantity: number; revenue: number }>()

for (const doc of snap.docs) {
  const sale = doc.data() as Sale
  if (sale.voidedAt) {
    voidedCount++
    voidedTotal += sale.total
    continue // voided sales never contribute to revenue/branch/payment/item aggregates
  }
  revenueTotal += sale.total
  nonVoidedCount++

  const branchEntry = byBranch.get(sale.branchId) ?? { revenue: 0, count: 0 }
  branchEntry.revenue += sale.total
  branchEntry.count += 1
  byBranch.set(sale.branchId, branchEntry)

  for (const payment of sale.payments) {
    byPaymentMethod.set(payment.method, (byPaymentMethod.get(payment.method) ?? 0) + payment.amount)
  }

  for (const item of sale.lineItems) {
    const key = `${item.type}:${item.itemId}`
    const itemEntry = byItem.get(key) ?? { type: item.type, name: item.name, quantity: 0, revenue: 0 }
    itemEntry.quantity += item.quantity
    itemEntry.revenue += item.lineTotal
    byItem.set(key, itemEntry)
  }
}

const averageSaleValue = nonVoidedCount > 0 ? revenueTotal / nonVoidedCount : 0
```

Branch names for display: fetch `branches` (org-wide, small collection, fetch all and build an id→name map) rather than one read per branch in the loop.

Response shape (plain primitives only — no Timestamp, no raw doc, by construction):
```ts
{
  range: { start: string, end: string },       // ISO strings, the resolved range actually used
  revenueTotal: number, nonVoidedCount: number, averageSaleValue: number,
  voidedCount: number, voidedTotal: number,
  byBranch: Array<{ branchId: string, branchName: string, revenue: number, count: number }>,
  byPaymentMethod: Array<{ method: string, amount: number }>,
  topSellers: Array<{ type: 'product' | 'service', itemId: string, name: string, quantity: number, revenue: number }>,
}
```
`topSellers` sorted by `revenue` descending before returning (the UI can re-sort by `quantity` client-side over this same array — no second query or server-side variant needed).

- [ ] Verify by hand: `byPaymentMethod` values summed equal `revenueTotal` (guaranteed by `api/sales/route.ts`'s existing payments-sum-equals-total validation on every non-voided sale — this is a structural guarantee, not something to re-validate here, but confirm it holds against real data in Task 2's manual check).
- [ ] Verify by hand: `byBranch` revenues summed equal `revenueTotal`.
- [ ] Commit: `git add src/lib/inventory/lowStock.ts src/app/api/reports/sales/route.ts && git commit -m "feat(reports): sales/revenue report API with top-sellers aggregation"`.

(`lowStock.ts` is bundled into this commit only because it's a small, unrelated-but-tiny shared file with no natural task of its own — flag if you'd rather it be its own commit.)

---

## `src/app/api/reports/inventory/route.ts`

**`GET`** — `requireCapability('reports.inventory.view')`. No date range — current-state report.

```ts
let stockQuery: FirebaseFirestore.Query = user.role === 'branch_manager'
  ? db.collection('productStock').where('branchId', '==', user.branchId)
  : db.collection('productStock')
const [stockSnap, productsSnap, branchesSnap] = await Promise.all([
  stockQuery.get(),
  db.collection('products').get(),
  db.collection('branches').get(),
])
const productsById = new Map(productsSnap.docs.map((d) => [d.id, d.data()]))
const branchNamesById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))
```

For each `productStock` doc, join to its product (skip — `continue` — if the product doc is missing, e.g. deleted; don't crash the report over an orphaned stock row) and compute `isLowStock(quantity, reorderThreshold)` (import from `src/lib/inventory/lowStock.ts`) and `value = quantity * unitCost`.

Aggregate `totalValue` at the org level (sum across every row in scope) and `byBranch: Array<{ branchId, branchName, totalValue }>` (sum grouped by `branchId` — "if it's not much more work" per your scope, and it's the same grouping pass already needed for the per-row output, so it's free).

Response shape:
```ts
{
  rows: Array<{ productId: string, productName: string, branchId: string, branchName: string, quantity: number, reorderThreshold: number, lowStock: boolean, value: number }>,
  totalValue: number,
  byBranch: Array<{ branchId: string, branchName: string, totalValue: number }>,
}
```

- [ ] Verify by hand against a manually-checked sample: pick 2-3 rows, confirm `quantity * unitCost` matches your own calculator, confirm `byBranch` values sum to `totalValue`, confirm `lowStock` is `true` exactly when `quantity <= reorderThreshold` (not `<`).
- [ ] Commit: `git add src/app/api/reports/inventory/route.ts && git commit -m "feat(reports): stock-levels report API with low-stock flagging and inventory value"`.

---

## CSV export — `src/lib/csv.ts` + `src/components/reports/DownloadCsvButton.tsx`

`src/lib/csv.ts`:
```ts
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (value: string | number) => {
    const str = String(value)
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n')
}
```

`src/components/reports/DownloadCsvButton.tsx` (`'use client'`):
```tsx
'use client'
export default function DownloadCsvButton({ filename, csv }: { filename: string; csv: string }) {
  function handleClick() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <button type="button" onClick={handleClick} className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-100">
      Download CSV
    </button>
  )
}
```
The `csv` string is built server-side (in the page component, from the exact same aggregated data object rendered in the tables above it) and passed down as a prop — the button never re-fetches or re-computes anything, which is what guarantees the file matches the screen (exit criterion) by construction, not by keeping two implementations in sync.

- [ ] Commit: `git add src/lib/csv.ts src/components/reports/DownloadCsvButton.tsx && git commit -m "feat(reports): CSV export utility and download button"`.

---

## Screens

### `src/app/(dashboard)/reports/sales/page.tsx`

Server component. `requireCapability('reports.sales.view')`. Reads `searchParams: Promise<{ startDate?: string; endDate?: string }>` (Next 16 Promise convention). Calls the same aggregation logic as the API route — **do this by calling `GET /api/reports/sales` is NOT the pattern here; instead, factor the aggregation into a shared function** (e.g. export `buildSalesReport(user, start, end)` from `src/app/api/reports/sales/route.ts` or a sibling `src/lib/reports/sales.ts`) that both the route and the page import, so there is exactly one aggregation implementation, not two. Prefer putting the actual aggregation logic in `src/lib/reports/sales.ts` (exporting `buildSalesReport`) and having `api/reports/sales/route.ts`'s `GET` be a thin wrapper (auth + param parsing + call + JSON response) — the page imports and calls the same `buildSalesReport` directly, matching every other page's direct-Admin-SDK-fetch convention rather than the page calling its own API route over HTTP.

Renders: a `<form method="GET">` date-range picker (two `<input type="date">`, defaulting to the resolved range's values, submit button), summary numbers (revenue total, count, average, voided count/value), a branch-breakdown table, a payment-method-breakdown table, a top-sellers table (client-sortable by quantity vs. revenue is a nice-to-have, not required — a static revenue-sorted table satisfies the exit criteria), and a `DownloadCsvButton` built from the same `report` object via `toCsv(...)`.

### `src/app/(dashboard)/reports/inventory/page.tsx`

Server component. `requireCapability('reports.inventory.view')`. Same "factor into `src/lib/reports/inventory.ts`'s `buildInventoryReport`, both the route and the page call it directly" structure. Renders the stock table (flagging low-stock rows visually, e.g. a red text/background on rows where `lowStock` is true), the total/by-branch inventory value, and a `DownloadCsvButton`.

- [ ] `npx tsc --noEmit` and `npx next build` both clean.
- [ ] Commit: `git add src/lib/reports src/app/api/reports src/app/\(dashboard\)/reports && git commit -m "feat(reports): sales and inventory report screens"` (adjust the exact paths added to whatever Task 4/5 actually created if the route files moved into `src/lib/reports/*.ts` — see the refactor note above; if that split happens, it supersedes the standalone route commits in the previous two sections and should be called out in the report explicitly).

---

## Nav Wiring (`src/components/layout/Sidebar.tsx`)

```ts
{ href: '/reports/sales', label: 'Sales Report', capability: 'reports.sales.view' },
{ href: '/reports/inventory', label: 'Stock Report', capability: 'reports.inventory.view' },
```

---

## Build Order

1. Permissions: `reporting` module, `REPORTS_ROLES`, 2 capabilities
2. `src/lib/inventory/lowStock.ts` + `src/lib/reports/sales.ts` (`buildSalesReport`) + `GET /api/reports/sales` thin wrapper — build and manually verify the branch/payment-method sum-back checks against real data
3. `src/lib/reports/inventory.ts` (`buildInventoryReport`) + `GET /api/reports/inventory` thin wrapper — manually verify the inventory-value arithmetic against a hand-checked sample
4. CSV utility + `DownloadCsvButton`
5. Screens: `/reports/sales`, `/reports/inventory`
6. Nav wiring
7. Full exit-criteria verification pass, including an explicit `git diff` check confirming zero changes to the four protected route files, and a live check that the branch-scoped sales query doesn't hit a missing-index error (Global Constraints' index-reuse assumption)

---

## Open questions / judgment calls (flagging per project convention, not guessing)

- **`reporting` is a new module**, not folded into the reserved-but-unbuilt `accounting` module — a direct application of this app's existing pattern (every phase so far got its own module) rather than assuming reports belong under finance-adjacent `accounting`.
- **CSV generation is entirely client-side**, from data already fetched for the on-screen render — a deliberate choice to make "the file matches the screen" true by construction, not a requirement to re-implement the same aggregation twice and keep them in sync.
- **The branch-scoped sales report query is assumed to reuse the existing `(branchId, createdAt)` composite index from Phase 4** rather than adding a new one — flagged explicitly in the plan for live verification (Task 2), given this project's history of composite-index surprises; if it turns out wrong, add the index and note it in the completion report rather than silently working around it.
- **`topSellers` is one array sorted by revenue**, not two separately-sorted arrays — the "ranked by quantity and by revenue" requirement is satisfiable by sorting the same small array two ways; sending duplicate data for a UI-only sort order isn't worth it.
- Accounting, payroll, a custom/configurable report builder, scheduled/emailed reports, and HR/customer-specific analytics are explicitly out of scope per your instruction — not touched anywhere in this plan.
- `docs/project-brief.md` still doesn't exist (same note as every prior phase) — this plan is built from your Phase 7 scope message plus `CLAUDE.md` (updated as part of this planning pass), not that file.
