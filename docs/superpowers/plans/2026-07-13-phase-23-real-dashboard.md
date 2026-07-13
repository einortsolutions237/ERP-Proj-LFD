# Phase 23 — Real Dashboard (Core Widgets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder "Welcome / Check In" landing page with a real, role-aware dashboard — a revenue trend chart, low-stock alerts, pending deliveries, and a curated recent-activity feed — while preserving the existing Check-In feature unchanged.

**Architecture:** `src/app/(dashboard)/dashboard/page.tsx` stays a Server Component that calls four new, independently capability-gated lib functions directly and in-process (no new API routes — same pattern already established for `getPendingDeliveries`/`getAppointments`/`getLabRecords`). Each lib function re-checks its own capability internally. A new standalone `dashboard.activity.view` capability governs the recent-activity widget only. All Firestore `Timestamp` fields are converted to ISO strings before crossing into any `'use client'` component.

**Tech Stack:** Next.js 16 App Router (Server + Client Components), TypeScript, Firebase Admin SDK (Firestore), Tailwind CSS v4 (existing token system), Recharts (new dependency), Vitest against the Firestore/Auth emulators.

## Global Constraints

- No existing route, capability, or business logic changes anywhere else in the app — every task below is additive or a pure restyle of one already-identified file (`AttendanceWidget.tsx`).
- Every new lib function takes `viewer: SessionUser` as a direct parameter (never re-derives from cookies) and internally calls `hasCapability`/throws `AuthError('Forbidden', 403)` if the capability is missing — matching `getPendingDeliveries`'s established belt-and-suspenders discipline.
- Every Firestore `Timestamp` field returned by a new lib function is converted to an ISO string (`.toDate().toISOString()`) before the value can reach a `'use client'` component boundary.
- `isBranchLocked(role)` gates branch-scoping for `inventory.stock.view` and `pos.delivery.fulfill`-backed widgets (matching `stock/page.tsx`'s Phase-12-fixed convention). `role === 'branch_manager'` (not `isBranchLocked`) gates the revenue-trend widget, matching `GET /api/reports/sales`'s existing, deliberately-unchanged-since-Phase-20 scoping convention for the same `reports.sales.view` capability.
- Card styling: `rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]` (Phase 21/22 token convention, matching `StaffTable.tsx`), not the older `rounded-md` convention still present on other, out-of-scope sections of the customer detail page.
- Design reference: `docs/superpowers/plans/2026-07-13-phase-23-real-dashboard-design.md` (approved). Read it before starting if any task below references a decision without repeating its full rationale.

---

### Task 1: `dashboard.activity.view` capability

**Files:**
- Modify: `src/lib/auth/permissions.ts`
- Modify: `tests/unit/permissions.test.ts`
- Modify: `tests/unit/__snapshots__/permissions.test.ts.snap` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: nothing new — extends the existing `Capability`/`ROLE_CAPABILITIES`/`MODULES` shapes in `src/lib/auth/permissions.ts`.
- Produces: `Capability` union gains `'dashboard.activity.view'`. `hasCapability(role, 'dashboard.activity.view')` returns `true` for exactly `['super_admin', 'general_manager', 'branch_manager']`. Every later task that reads/writes the recent-activity widget imports and checks this exact capability string.

**Review tier: Opus** (capability grant — matching this project's unwavering practice of Opus-reviewing every capability-grant task, e.g. Phase 13's Task 1, Phase 14's Task 1, Phase 16's Task 1, Phase 19.2's Task 1).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/permissions.test.ts`, inside the existing `describe('role x capability matrix', ...)` block, after the last existing `it(...)`:

```ts
  it('dashboard.activity.view is exactly [super_admin, general_manager, branch_manager]', () => {
    expect(ROLE_CAPABILITIES['dashboard.activity.view'].slice().sort()).toEqual(['branch_manager', 'general_manager', 'super_admin'])
  })

  it('dashboard.activity.view is not held by cashier, admin, finance_admin, or any clinical/lab/seminar role', () => {
    const excluded: RoleId[] = ['cashier', 'admin', 'finance_admin', 'hr_admin', 'it_admin', 'doctor', 'medical_secretary', 'protocol', 'nurse', 'lab_staff', 'inventory_manager']
    for (const role of excluded) {
      expect(hasCapability(role, 'dashboard.activity.view')).toBe(false)
    }
  })
```

`RoleId` must be imported into the test file's existing import block — add it alongside the already-imported `Capability`:

```ts
import {
  ROLES,
  ROLE_CAPABILITIES,
  BRANCH_LOCKED_ROLES,
  hasCapability,
  isBranchLocked,
  type Capability,
  type RoleId,
} from '@/lib/auth/permissions'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `ROLE_CAPABILITIES['dashboard.activity.view']` is `undefined` (property doesn't exist yet), and the TypeScript compile itself will also fail on `'dashboard.activity.view'` not being assignable to `Capability`.

- [ ] **Step 3: Add the capability to `src/lib/auth/permissions.ts`**

Add `'dashboard'` to the `MODULES` array:

```ts
export const MODULES = ['admin', 'pos', 'inventory', 'crm', 'accounting', 'hr', 'reporting', 'clinical', 'seminars', 'messaging', 'dashboard'] as const
```

Add `'dashboard.activity.view'` to the `Capability` union (append after the existing `'messaging.access'` line, before the closing comment):

```ts
  // Gates baseline access to the messaging feature only (i.e. "is this a
  // valid staff account"). It does NOT decide who a given sender can reach —
  // that is canMessage()'s job, re-evaluated per-recipient on every list/read/
  // send, never cached. Granted to every role because everyone has at least
  // one reachable contact (their own branch's branch_manager, at minimum, or
  // the IT support line).
  | 'messaging.access'
  // Phase 23 — dashboard recent-activity widget. Deliberately NOT
  // admin.auditLog.view (that stayed narrow to admin/it_admin/super_admin in
  // Phase 17 for the full, unfiltered audit trail); this is a curated,
  // business-relevant activity summary for management-level oversight,
  // scoped to a standalone role list — see DASHBOARD_ACTIVITY_ROLES below.
  | 'dashboard.activity.view'
  // accounting.* — no capabilities defined yet;
  // add them here when the module is actually built.
```

Add to `CAPABILITY_MODULE`:

```ts
  'messaging.access': 'messaging',
  'dashboard.activity.view': 'dashboard',
}
```

Add the standalone role constant, placed near `POS_DELIVERY_FULFILL_ROLES` (after it, before the Phase 19.1 intake constants):

```ts
// Phase 23 — dashboard recent-activity widget. Membership currently matches
// GENERAL_MANAGER_BRANCH_MGR (admin.departments.manage/pos.sale.void) but the
// two capabilities are semantically unrelated — standalone so a future
// change to department-management or sale-void authority can't silently
// also change dashboard-activity visibility. branch_manager sees only their
// own branch's activity (plus org-wide/null-branchId entries); general_manager
// and super_admin see everything — enforced inside getRecentActivity, not
// here (this list only decides who gets the widget at all).
const DASHBOARD_ACTIVITY_ROLES: RoleId[] = ['super_admin', 'general_manager', 'branch_manager']
```

Add to `ROLE_CAPABILITIES`:

```ts
  'messaging.access': ALL_ROLES,
  'dashboard.activity.view': DASHBOARD_ACTIVITY_ROLES,
}
```

- [ ] **Step 4: Run tests, update the snapshot, verify everything passes**

Run: `npm test`
Expected: the two new tests pass. The existing `matches the exact grant table for every role x every capability` snapshot test will FAIL (expected — the matrix now has a new column). Regenerate it:

Run: `npx vitest run tests/unit/permissions.test.ts -u`
Expected: snapshot file updated, all tests in `tests/unit/permissions.test.ts` pass.

Run: `npm test`
Expected: all 424+ pre-existing tests plus the 2 new ones pass — confirm no other test's snapshot or assertion moved (the diff to `permissions.test.ts.snap` should show only `dashboard.activity.view` rows added, every existing role/capability cell byte-identical).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/permissions.ts tests/unit/permissions.test.ts tests/unit/__snapshots__/permissions.test.ts.snap
git commit -m "feat: add dashboard.activity.view capability for Phase 23"
```

---

### Task 2: `buildRevenueTrend` — revenue trend chart data

**Files:**
- Create: `src/lib/dashboard/revenueTrend.ts`
- Modify: `tests/setup/fixtures.ts` (add `seedSale`)
- Create: `tests/integration/dashboardRevenueTrend.test.ts`

**Interfaces:**
- Consumes: `SessionUser` (`src/lib/auth/server-guard.ts`), `hasCapability` (`src/lib/auth/permissions.ts`), `Sale` type (`src/lib/types/sale.ts`), `getAdminFirestore` (`src/lib/firebase/admin.ts`).
- Produces:
  ```ts
  export interface RevenueTrendPoint { date: string; revenue: number }
  export async function buildRevenueTrend(user: SessionUser, days?: number): Promise<RevenueTrendPoint[]>
  ```
  `date` is a `'YYYY-MM-DD'` UTC calendar-day string, ascending order, one entry per day in range including zero-revenue days. Task 6/9 import `RevenueTrendPoint` and `buildRevenueTrend` by these exact names.

**Review tier: Sonnet** (read-only aggregation over an already-audited, unmodified collection — no transaction, no write path, mirrors the already-reviewed `buildSalesReport` query shape).

- [ ] **Step 1: Add the `seedSale` fixture**

In `tests/setup/fixtures.ts`, add after `seedCustomer`:

```ts
export async function seedSale(input: { branchId: string; total: number; createdAt: Date; voidedAt?: Date | null }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('sales').doc()
  await ref.set({
    branchId: input.branchId,
    lineItems: [],
    subtotal: input.total,
    discountAmount: 0,
    taxAmount: 0,
    total: input.total,
    payments: [{ method: 'cash', amount: input.total, reference: null }],
    cashierUid: 'test-cashier',
    customerId: null,
    clientIdempotencyKey: null,
    voidedAt: input.voidedAt ?? null,
    voidedBy: input.voidedAt ? 'test-voider' : null,
    voidReason: input.voidedAt ? 'test void' : null,
    createdAt: input.createdAt,
  })
  return { id: ref.id }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/integration/dashboardRevenueTrend.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedSale } from '../setup/fixtures'
import { buildRevenueTrend } from '@/lib/dashboard/revenueTrend'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('buildRevenueTrend', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let superAdminUser: SessionUser
  let financeAdminUser: SessionUser
  let cashierUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Revenue Trend Branch A')
    const b = await seedBranch('Dashboard Revenue Trend Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-revtrend-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    superAdminUser = { uid: 'dashboard-revtrend-sa', email: 'sa@test.local', role: 'super_admin', branchId: branchA }
    financeAdminUser = { uid: 'dashboard-revtrend-fa', email: 'fa@test.local', role: 'finance_admin', branchId: branchA }
    cashierUser = { uid: 'dashboard-revtrend-cash', email: 'cash@test.local', role: 'cashier', branchId: branchA }

    const today = new Date()
    today.setUTCHours(12, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const outsideWindow = new Date(today)
    outsideWindow.setUTCDate(outsideWindow.getUTCDate() - 40)

    await seedSale({ branchId: branchA, total: 1000, createdAt: today })
    await seedSale({ branchId: branchA, total: 500, createdAt: yesterday })
    await seedSale({ branchId: branchA, total: 9999, createdAt: today, voidedAt: today })
    await seedSale({ branchId: branchB, total: 300, createdAt: today })
    await seedSale({ branchId: branchA, total: 7777, createdAt: outsideWindow })
  })

  it('buckets non-voided branch-A revenue by UTC day, excludes voided sales and sales outside the 30-day window, for a branch_manager', async () => {
    const trend = await buildRevenueTrend(branchManagerUser, 30)
    expect(trend).toHaveLength(30)
    const totalRevenue = trend.reduce((sum, p) => sum + p.revenue, 0)
    expect(totalRevenue).toBe(1500) // 1000 (today) + 500 (yesterday); voided 9999 and outside-window 7777 both excluded
    const todayKey = new Date().toISOString().slice(0, 10)
    expect(trend[trend.length - 1].date).toBe(todayKey)
    expect(trend[trend.length - 1].revenue).toBe(1000)
  })

  it('super_admin and finance_admin see revenue across both branches (org-wide), matching reports.sales.view scoping', async () => {
    const trendSA = await buildRevenueTrend(superAdminUser, 30)
    const trendFA = await buildRevenueTrend(financeAdminUser, 30)
    const totalSA = trendSA.reduce((sum, p) => sum + p.revenue, 0)
    const totalFA = trendFA.reduce((sum, p) => sum + p.revenue, 0)
    expect(totalSA).toBe(1800) // branch A's 1500 + branch B's 300
    expect(totalFA).toBe(1800)
  })

  it('rejects a role without reports.sales.view', async () => {
    await expect(buildRevenueTrend(cashierUser, 30)).rejects.toThrow('Forbidden')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- dashboardRevenueTrend`
Expected: FAIL — `Cannot find module '@/lib/dashboard/revenueTrend'`.

- [ ] **Step 4: Implement `src/lib/dashboard/revenueTrend.ts`**

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Sale } from '@/lib/types/sale'

export interface RevenueTrendPoint {
  date: string // 'YYYY-MM-DD', UTC calendar day
  revenue: number
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Reuses buildSalesReport's exact scoping convention (role === 'branch_manager',
// not isBranchLocked) since this shares the same reports.sales.view capability
// and must behave identically for who sees what — see GET /api/reports/sales,
// deliberately left unchanged since Phase 20.
export async function buildRevenueTrend(user: SessionUser, days = 30): Promise<RevenueTrendPoint[]> {
  if (!hasCapability(user.role, 'reports.sales.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const end = new Date()
  end.setUTCHours(23, 59, 59, 999)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  start.setUTCHours(0, 0, 0, 0)

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = user.role === 'branch_manager'
    ? db.collection('sales').where('branchId', '==', user.branchId)
    : db.collection('sales')
  query = query.where('createdAt', '>=', start).where('createdAt', '<=', end)
  const snap = await query.get()

  const byDay = new Map<string, number>()
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    byDay.set(dayKey(d), 0)
  }

  for (const doc of snap.docs) {
    const sale = doc.data() as Sale
    if (sale.voidedAt) continue // voided sales never contribute to revenue, matching buildSalesReport
    const key = dayKey(sale.createdAt.toDate())
    byDay.set(key, (byDay.get(key) ?? 0) + sale.total)
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, revenue]) => ({ date, revenue }))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- dashboardRevenueTrend`
Expected: PASS (all 3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/revenueTrend.ts tests/setup/fixtures.ts tests/integration/dashboardRevenueTrend.test.ts
git commit -m "feat: add buildRevenueTrend for the dashboard revenue widget"
```

---

### Task 3: `getDashboardLowStock` — low-stock alerts

**Files:**
- Create: `src/lib/dashboard/lowStockSummary.ts`
- Modify: `tests/setup/fixtures.ts` (extend `seedProduct`)
- Create: `tests/integration/dashboardLowStock.test.ts`

**Interfaces:**
- Consumes: `SessionUser`, `hasCapability`, `isBranchLocked` (`src/lib/auth/permissions.ts`), `isLowStock` (`src/lib/inventory/lowStock.ts`), `ProductStock`/`Product` types.
- Produces:
  ```ts
  export interface LowStockRow { productId: string; productName: string; branchId: string; branchName: string; quantity: number; reorderThreshold: number }
  export interface LowStockSummary { rows: LowStockRow[]; totalCount: number }
  export async function getDashboardLowStock(viewer: SessionUser): Promise<LowStockSummary>
  ```
  Task 7/9 import `LowStockSummary` and `getDashboardLowStock` by these exact names.

**Review tier: Sonnet** (read-only join/filter over already-audited collections, reusing the existing `isLowStock` comparison verbatim — no new business logic beyond aggregation).

- [ ] **Step 1: Extend the `seedProduct` fixture**

In `tests/setup/fixtures.ts`, replace the existing `seedProduct` function with (adds two optional, backward-compatible parameters — every existing call site that omits them keeps its prior behavior):

```ts
export async function seedProduct(input: { name: string; price: number; active?: boolean; reorderThreshold?: number; unitCost?: number }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('products').doc()
  await ref.set({
    name: input.name,
    price: input.price,
    active: input.active ?? true,
    sku: `SKU-${ref.id}`,
    unitCost: input.unitCost ?? 0,
    reorderThreshold: input.reorderThreshold ?? 5,
    supplierId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return { id: ref.id }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/integration/dashboardLowStock.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedProduct, seedProductStock } from '../setup/fixtures'
import { getDashboardLowStock } from '@/lib/dashboard/lowStockSummary'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getDashboardLowStock', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let superAdminUser: SessionUser
  let generalManagerUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Low Stock Branch A')
    const b = await seedBranch('Dashboard Low Stock Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-lowstock-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    superAdminUser = { uid: 'dashboard-lowstock-sa', email: 'sa@test.local', role: 'super_admin', branchId: branchA }
    generalManagerUser = { uid: 'dashboard-lowstock-gm', email: 'gm@test.local', role: 'general_manager', branchId: branchA }

    const lowProduct = await seedProduct({ name: 'Low Widget', price: 100, reorderThreshold: 10 })
    const boundaryProduct = await seedProduct({ name: 'Boundary Widget', price: 100, reorderThreshold: 5 })
    const okProduct = await seedProduct({ name: 'OK Widget', price: 100, reorderThreshold: 5 })

    await seedProductStock({ branchId: branchA, productId: lowProduct.id, quantity: 3 }) // 3 <= 10 -> low
    await seedProductStock({ branchId: branchA, productId: boundaryProduct.id, quantity: 5 }) // 5 <= 5 -> low (exact boundary)
    await seedProductStock({ branchId: branchA, productId: okProduct.id, quantity: 20 }) // 20 > 5 -> not low
    await seedProductStock({ branchId: branchB, productId: lowProduct.id, quantity: 1 }) // low, different branch
  })

  it('branch_manager sees only their own branch\'s low-stock rows, including the exact-boundary case', async () => {
    const summary = await getDashboardLowStock(branchManagerUser)
    expect(summary.totalCount).toBe(2)
    expect(summary.rows.map((r) => r.productName).sort()).toEqual(['Boundary Widget', 'Low Widget'])
    expect(summary.rows.every((r) => r.branchId === branchA)).toBe(true)
  })

  it('super_admin sees low-stock rows across both branches', async () => {
    const summary = await getDashboardLowStock(superAdminUser)
    expect(summary.totalCount).toBe(3) // 2 in branch A + 1 in branch B
  })

  it('rejects general_manager, which does not hold inventory.stock.view', async () => {
    await expect(getDashboardLowStock(generalManagerUser)).rejects.toThrow('Forbidden')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- dashboardLowStock`
Expected: FAIL — `Cannot find module '@/lib/dashboard/lowStockSummary'`.

- [ ] **Step 4: Implement `src/lib/dashboard/lowStockSummary.ts`**

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { ProductStock } from '@/lib/types/stock'
import type { Product } from '@/lib/types/product'
import { isLowStock } from '@/lib/inventory/lowStock'

export interface LowStockRow {
  productId: string
  productName: string
  branchId: string
  branchName: string
  quantity: number
  reorderThreshold: number
}

export interface LowStockSummary {
  rows: LowStockRow[]
  totalCount: number
}

// Gated on inventory.stock.view (held today by super_admin/branch_manager
// only, via BRANCH_LOCKED_ROLES' sibling BRANCH_MANAGER_ONLY) — deliberately
// NOT reports.inventory.view/buildInventoryReport's role === 'branch_manager'
// scoping, since that's a different capability with a different, wider role
// set. isBranchLocked matches this widget's own capability's actual read
// route (stock/page.tsx, Phase-12-fixed), not the unrelated reports pattern.
export async function getDashboardLowStock(viewer: SessionUser): Promise<LowStockSummary> {
  if (!hasCapability(viewer.role, 'inventory.stock.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const stockQuery: FirebaseFirestore.Query = isBranchLocked(viewer.role)
    ? db.collection('productStock').where('branchId', '==', viewer.branchId)
    : db.collection('productStock')

  const [stockSnap, productsSnap, branchesSnap] = await Promise.all([
    stockQuery.get(),
    db.collection('products').get(),
    db.collection('branches').get(),
  ])
  const productsById = new Map(productsSnap.docs.map((d) => [d.id, d.data() as Product]))
  const branchNamesById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))

  const lowStockRows: LowStockRow[] = []
  for (const doc of stockSnap.docs) {
    const stock = doc.data() as ProductStock
    const product = productsById.get(stock.productId)
    if (!product) continue // orphaned stock row (deleted product) — skip, don't crash the widget
    if (!isLowStock(stock.quantity, product.reorderThreshold)) continue

    lowStockRows.push({
      productId: stock.productId,
      productName: product.name,
      branchId: stock.branchId,
      branchName: branchNamesById.get(stock.branchId) ?? stock.branchId,
      quantity: stock.quantity,
      reorderThreshold: product.reorderThreshold,
    })
  }

  lowStockRows.sort((a, b) => (b.reorderThreshold - b.quantity) - (a.reorderThreshold - a.quantity))

  return {
    rows: lowStockRows.slice(0, 5),
    totalCount: lowStockRows.length,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- dashboardLowStock`
Expected: PASS (all 3 tests, including the exact-boundary `quantity === reorderThreshold` case).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/lowStockSummary.ts tests/setup/fixtures.ts tests/integration/dashboardLowStock.test.ts
git commit -m "feat: add getDashboardLowStock, reusing the shared isLowStock helper"
```

---

### Task 4: `getDashboardPendingDeliveries` — pending deliveries widget

**Files:**
- Create: `src/lib/dashboard/pendingDeliveriesSummary.ts`
- Modify: `tests/setup/fixtures.ts` (add `seedPendingDelivery`)
- Modify: `firestore.indexes.json` (two new composite indexes — see note below)
- Create: `tests/integration/dashboardPendingDeliveries.test.ts`

**Interfaces:**
- Consumes: `SessionUser`, `hasCapability`, `isBranchLocked`, `PendingDelivery` type.
- Produces:
  ```ts
  export interface DashboardPendingDelivery { id: string; productName: string; branchName: string; quantityOwed: number; createdAt: string }
  export interface PendingDeliveriesSummary { rows: DashboardPendingDelivery[]; totalCount: number }
  export async function getDashboardPendingDeliveries(viewer: SessionUser): Promise<PendingDeliveriesSummary>
  ```
  Task 7/9 import `PendingDeliveriesSummary` and `getDashboardPendingDeliveries` by these exact names. `createdAt` is already an ISO string (Timestamp-leak rule).

**Review tier: Sonnet** (read-only query/join, same shape as `getPendingDeliveries`; flag the index addition below for explicit reviewer attention even though it's not transactional logic).

**Reviewer attention required:** this task's query (`status == 'pending'` combined with an `orderBy('createdAt')`, and for branch-locked viewers also `branchId == ...`) needs two new Firestore composite indexes that do not exist today (`firestore.indexes.json` currently only has `pendingDeliveries` indexes keyed on `customerId`, not `status`). The Firestore emulator used by this project's test suite does **not** enforce composite-index requirements (no `indexes` key is referenced in `firebase.testing.json`), so this task's own tests will pass locally even if the indexes are missing from `firestore.indexes.json` — the same gap Phase 19.2 caught for `labOrders(status, orderedAt)` before it shipped. Confirm both new index entries are present in the diff; do not rely on the test run to catch a missing one.

- [ ] **Step 1: Add the `seedPendingDelivery` fixture**

In `tests/setup/fixtures.ts`, add after `seedSale` (from Task 2):

```ts
export async function seedPendingDelivery(input: { branchId: string; productId: string; customerId: string; saleId: string; status?: 'pending' | 'fulfilled'; createdAt?: Date }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('pendingDeliveries').doc()
  await ref.set({
    saleId: input.saleId,
    productId: input.productId,
    customerId: input.customerId,
    branchId: input.branchId,
    quantityOwed: 2,
    status: input.status ?? 'pending',
    fulfilledBy: null,
    fulfilledAt: null,
    createdAt: input.createdAt ?? new Date(),
  })
  return { id: ref.id }
}
```

- [ ] **Step 2: Add the two new composite indexes**

In `firestore.indexes.json`, add these two entries to the `indexes` array (after the existing two `pendingDeliveries` entries):

```json
    {
      "collectionGroup": "pendingDeliveries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "pendingDeliveries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "branchId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
```

- [ ] **Step 3: Write the failing test**

Create `tests/integration/dashboardPendingDeliveries.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedProduct, seedCustomer, seedPendingDelivery } from '../setup/fixtures'
import { getDashboardPendingDeliveries } from '@/lib/dashboard/pendingDeliveriesSummary'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getDashboardPendingDeliveries', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let cashierUser: SessionUser
  let generalManagerUser: SessionUser
  let hrAdminUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Pending Deliveries Branch A')
    const b = await seedBranch('Dashboard Pending Deliveries Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-pd-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    cashierUser = { uid: 'dashboard-pd-cashier', email: 'cash@test.local', role: 'cashier', branchId: branchA }
    generalManagerUser = { uid: 'dashboard-pd-gm', email: 'gm@test.local', role: 'general_manager', branchId: branchA }
    hrAdminUser = { uid: 'dashboard-pd-hr', email: 'hr@test.local', role: 'hr_admin', branchId: branchA }

    const product = await seedProduct({ name: 'Backordered Widget', price: 100 })
    const customer = await seedCustomer({ name: 'Test Customer', phone: '+1000000001' })

    await seedPendingDelivery({ branchId: branchA, productId: product.id, customerId: customer.id, saleId: 'sale-1', status: 'pending' })
    await seedPendingDelivery({ branchId: branchA, productId: product.id, customerId: customer.id, saleId: 'sale-2', status: 'fulfilled' }) // must be excluded
    await seedPendingDelivery({ branchId: branchB, productId: product.id, customerId: customer.id, saleId: 'sale-3', status: 'pending' })
  })

  it('branch_manager and cashier see only their own branch\'s pending (not fulfilled) deliveries', async () => {
    const summaryBM = await getDashboardPendingDeliveries(branchManagerUser)
    const summaryCashier = await getDashboardPendingDeliveries(cashierUser)
    expect(summaryBM.totalCount).toBe(1)
    expect(summaryCashier.totalCount).toBe(1)
    expect(summaryBM.rows[0].productName).toBe('Backordered Widget')
  })

  it('general_manager sees pending deliveries across both branches', async () => {
    const summary = await getDashboardPendingDeliveries(generalManagerUser)
    expect(summary.totalCount).toBe(2)
  })

  it('rejects hr_admin, which does not hold pos.delivery.fulfill', async () => {
    await expect(getDashboardPendingDeliveries(hrAdminUser)).rejects.toThrow('Forbidden')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- dashboardPendingDeliveries`
Expected: FAIL — `Cannot find module '@/lib/dashboard/pendingDeliveriesSummary'`.

- [ ] **Step 5: Implement `src/lib/dashboard/pendingDeliveriesSummary.ts`**

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { PendingDelivery } from '@/lib/types/pendingDelivery'

export interface DashboardPendingDelivery {
  id: string
  productName: string
  branchName: string
  quantityOwed: number
  createdAt: string
}

export interface PendingDeliveriesSummary {
  rows: DashboardPendingDelivery[]
  totalCount: number
}

export async function getDashboardPendingDeliveries(viewer: SessionUser): Promise<PendingDeliveriesSummary> {
  if (!hasCapability(viewer.role, 'pos.delivery.fulfill')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('pendingDeliveries').where('status', '==', 'pending')
  if (isBranchLocked(viewer.role)) {
    query = query.where('branchId', '==', viewer.branchId)
  }
  query = query.orderBy('createdAt', 'asc')
  const snap = await query.get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as PendingDelivery }))
  const uniqueProductIds = Array.from(new Set(docs.map((d) => d.data.productId)))
  const uniqueBranchIds = Array.from(new Set(docs.map((d) => d.data.branchId)))
  const [productDocs, branchDocs] = await Promise.all([
    Promise.all(uniqueProductIds.map((id) => db.collection('products').doc(id).get())),
    Promise.all(uniqueBranchIds.map((id) => db.collection('branches').doc(id).get())),
  ])
  const productNames: Record<string, string> = {}
  uniqueProductIds.forEach((id, i) => {
    productNames[id] = (productDocs[i].data()?.name as string | undefined) ?? id
  })
  const branchNames: Record<string, string> = {}
  uniqueBranchIds.forEach((id, i) => {
    branchNames[id] = (branchDocs[i].data()?.name as string | undefined) ?? id
  })

  const rows: DashboardPendingDelivery[] = docs.map(({ id, data }) => ({
    id,
    productName: productNames[data.productId] ?? data.productId,
    branchName: branchNames[data.branchId] ?? data.branchId,
    quantityOwed: data.quantityOwed,
    createdAt: data.createdAt.toDate().toISOString(),
  }))

  return {
    rows: rows.slice(0, 5),
    totalCount: rows.length,
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- dashboardPendingDeliveries`
Expected: PASS (all 3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard/pendingDeliveriesSummary.ts tests/setup/fixtures.ts tests/integration/dashboardPendingDeliveries.test.ts firestore.indexes.json
git commit -m "feat: add getDashboardPendingDeliveries and its two new composite indexes"
```

---

### Task 5: `getRecentActivity` — recent-activity feed

**Files:**
- Create: `src/lib/dashboard/recentActivity.ts`
- Modify: `tests/setup/fixtures.ts` (add `seedAuditLogEntry`)
- Create: `tests/integration/dashboardRecentActivity.test.ts`

**Interfaces:**
- Consumes: `SessionUser`, `hasCapability`, `isBranchLocked`, `AuditAction` type (`src/lib/types/audit.ts`).
- Produces:
  ```ts
  export const DASHBOARD_ACTIVITY_ACTIONS: AuditAction[] // exported so the test and any future consumer can assert exact membership
  export interface RecentActivityItem { id: string; action: AuditAction; actorEmail: string | null; branchId: string | null; createdAt: string }
  export async function getRecentActivity(viewer: SessionUser): Promise<RecentActivityItem[]>
  ```
  Task 7/9 import `RecentActivityItem` and `getRecentActivity` by these exact names.

**Review tier: Opus** (implements the new `dashboard.activity.view` capability's branch-scoping/visibility rule from the design — this is the "genuinely new access decision" of the phase; treat with the same scrutiny this project applies to any new relationship/scoping logic, e.g. Phase 19's `canMessage`).

- [ ] **Step 1: Add the `seedAuditLogEntry` fixture**

In `tests/setup/fixtures.ts`, add after `seedPendingDelivery` (from Task 4):

```ts
export async function seedAuditLogEntry(input: { action: string; branchId: string | null; createdAt: Date; actorEmail?: string }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('auditLogs').doc()
  await ref.set({
    action: input.action,
    actorUid: 'test-actor',
    actorEmail: input.actorEmail ?? 'actor@test.local',
    targetUid: null,
    branchId: input.branchId,
    details: null,
    createdAt: input.createdAt,
  })
  return { id: ref.id }
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/integration/dashboardRecentActivity.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedAuditLogEntry } from '../setup/fixtures'
import { getRecentActivity, DASHBOARD_ACTIVITY_ACTIONS } from '@/lib/dashboard/recentActivity'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getRecentActivity', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let generalManagerUser: SessionUser
  let cashierUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Recent Activity Branch A')
    const b = await seedBranch('Dashboard Recent Activity Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-activity-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    generalManagerUser = { uid: 'dashboard-activity-gm', email: 'gm@test.local', role: 'general_manager', branchId: branchA }
    cashierUser = { uid: 'dashboard-activity-cashier', email: 'cash@test.local', role: 'cashier', branchId: branchA }

    const now = new Date()
    const t = (secondsAgo: number) => new Date(now.getTime() - secondsAgo * 1000)

    await seedAuditLogEntry({ action: 'sale_create', branchId: branchA, createdAt: t(10) }) // whitelisted, branch A
    await seedAuditLogEntry({ action: 'sale_create', branchId: branchB, createdAt: t(20) }) // whitelisted, branch B
    await seedAuditLogEntry({ action: 'product_edit', branchId: null, createdAt: t(30) }) // whitelisted, org-wide (null branchId)
    await seedAuditLogEntry({ action: 'login', branchId: branchA, createdAt: t(5) }) // NOT whitelisted (security telemetry)
    await seedAuditLogEntry({ action: 'clinical_record_view', branchId: branchA, createdAt: t(1) }) // NOT whitelisted (clinical wall)
  })

  it('exports the exact approved whitelist', () => {
    expect(DASHBOARD_ACTIVITY_ACTIONS.slice().sort()).toEqual(
      [
        'sale_create', 'sale_void', 'stock_adjust', 'stock_transfer', 'pending_delivery_fulfilled',
        'staff_create', 'staff_edit', 'staff_delete', 'permission_change',
        'product_create', 'product_edit', 'product_delete',
        'service_create', 'service_edit', 'service_delete',
        'supplier_create', 'supplier_edit', 'supplier_delete',
        'customer_create', 'customer_edit', 'customer_delete',
        'leave_request_create',
      ].sort()
    )
  })

  it('branch_manager sees own-branch entries plus org-wide (null branchId) entries, never another branch\'s, and never a non-whitelisted action', async () => {
    const items = await getRecentActivity(branchManagerUser)
    const actions = items.map((i) => i.action)
    expect(actions).toContain('sale_create')
    expect(actions).toContain('product_edit') // org-wide entry, visible to branch_manager
    expect(actions).not.toContain('login')
    expect(actions).not.toContain('clinical_record_view')
    expect(items.some((i) => i.branchId === branchB)).toBe(false) // never another branch's entry
  })

  it('general_manager sees whitelisted entries from every branch, unfiltered', async () => {
    const items = await getRecentActivity(generalManagerUser)
    const actions = items.map((i) => i.action)
    expect(items.some((i) => i.branchId === branchA)).toBe(true)
    expect(items.some((i) => i.branchId === branchB)).toBe(true)
    expect(actions).not.toContain('login')
    expect(actions).not.toContain('clinical_record_view')
  })

  it('rejects cashier, which does not hold dashboard.activity.view', async () => {
    await expect(getRecentActivity(cashierUser)).rejects.toThrow('Forbidden')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- dashboardRecentActivity`
Expected: FAIL — `Cannot find module '@/lib/dashboard/recentActivity'`.

- [ ] **Step 4: Implement `src/lib/dashboard/recentActivity.ts`**

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { AuditAction, AuditLogEntry } from '@/lib/types/audit'

// Curated, business-relevant subset of AuditAction — approved in the Phase 23
// design doc. Deliberately excludes every clinical/lab/appointment/intake/
// seminar-attendance/messaging action (patient- or private-communication-
// adjacent, walled off from branch_manager/general_manager everywhere else
// in this app) and login/login_failed/logout (security telemetry, not
// business activity).
export const DASHBOARD_ACTIVITY_ACTIONS: AuditAction[] = [
  'sale_create', 'sale_void', 'stock_adjust', 'stock_transfer', 'pending_delivery_fulfilled',
  'staff_create', 'staff_edit', 'staff_delete', 'permission_change',
  'product_create', 'product_edit', 'product_delete',
  'service_create', 'service_edit', 'service_delete',
  'supplier_create', 'supplier_edit', 'supplier_delete',
  'customer_create', 'customer_edit', 'customer_delete',
  'leave_request_create',
]

const ACTIVITY_ACTION_SET = new Set<AuditAction>(DASHBOARD_ACTIVITY_ACTIONS)

export interface RecentActivityItem {
  id: string
  action: AuditAction
  actorEmail: string | null
  branchId: string | null
  createdAt: string
}

// Deliberately avoids a where('action','in',[...]).where('branchId','in',[...])
// query — Firestore forbids two 'in' clauses in one query, and that shape
// would need a new composite index. Instead: fetch the most recent ~300
// auditLogs entries (single-field orderBy, already indexed automatically,
// no new index needed) and filter in-memory. Trade-off: if a branch's most
// recent matching action falls outside this 300-entry global window, it
// won't surface here — acceptable for a "recent activity" widget, not
// acceptable if this function is ever repurposed as a report.
const RECENT_WINDOW_SIZE = 300
const RESULT_LIMIT = 10

export async function getRecentActivity(viewer: SessionUser): Promise<RecentActivityItem[]> {
  if (!hasCapability(viewer.role, 'dashboard.activity.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const snap = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(RECENT_WINDOW_SIZE).get()

  const branchLocked = isBranchLocked(viewer.role)
  const items: RecentActivityItem[] = []
  for (const doc of snap.docs) {
    const entry = doc.data() as AuditLogEntry
    if (!ACTIVITY_ACTION_SET.has(entry.action)) continue
    if (branchLocked && entry.branchId !== viewer.branchId && entry.branchId !== null) continue
    items.push({
      id: doc.id,
      action: entry.action,
      actorEmail: entry.actorEmail,
      branchId: entry.branchId,
      createdAt: entry.createdAt.toDate().toISOString(),
    })
    if (items.length >= RESULT_LIMIT) break
  }

  return items
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- dashboardRecentActivity`
Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/recentActivity.ts tests/setup/fixtures.ts tests/integration/dashboardRecentActivity.test.ts
git commit -m "feat: add getRecentActivity with the new dashboard.activity.view visibility rule"
```

---

### Task 6: Recharts dependency + `DashboardCard` + `RevenueTrendChart`

**Files:**
- Modify: `package.json` (add `recharts`)
- Create: `src/components/dashboard/DashboardCard.tsx`
- Create: `src/components/dashboard/RevenueTrendChart.tsx`

**Interfaces:**
- Consumes: `RevenueTrendPoint` (Task 2).
- Produces:
  ```tsx
  export default function DashboardCard({ title, children }: { title: string; children: React.ReactNode }): JSX.Element
  export default function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }): JSX.Element // 'use client'
  ```
  Task 9 imports both by these exact default-export names and prop shapes.

**Review tier: Sonnet** (presentational components, no business logic, no data fetching inside the client component).

- [ ] **Step 1: Install Recharts**

Run: `npm install recharts`
Expected: `package.json`'s `dependencies` gains a `"recharts"` entry; `package-lock.json` updates.

- [ ] **Step 2: Create `src/components/dashboard/DashboardCard.tsx`**

```tsx
export default function DashboardCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-mist bg-surface p-4 shadow-[var(--shadow-card)]">
      <h2 className="mb-3 text-lg font-medium text-ink">{title}</h2>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/dashboard/RevenueTrendChart.tsx`**

```tsx
'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { RevenueTrendPoint } from '@/lib/dashboard/revenueTrend'

// Recharts renders raw SVG and does not consume Tailwind utility classes for
// stroke/fill — these hex values are the literal values of this app's
// --color-marine/--color-mist/--color-slate tokens (src/app/globals.css) and
// must be updated here too if those tokens ever change. This is the one
// deliberate, narrow exception to this app's "zero hardcoded hex" invariant
// (confirmed clean as of Phase 21), required by the charting library itself.
const MARINE = '#0f5c66'
const MIST = '#e2e8f0'
const SLATE = '#475569'

export default function RevenueTrendChart({ data }: { data: RevenueTrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={MARINE} stopOpacity={0.35} />
              <stop offset="95%" stopColor={MARINE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={MIST} vertical={false} />
          <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} stroke={SLATE} tick={{ fontSize: 11 }} />
          <YAxis stroke={SLATE} tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            formatter={(value: number) => [value.toLocaleString(), 'Revenue']}
            contentStyle={{ borderRadius: 12, borderColor: MIST, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="revenue" stroke={MARINE} strokeWidth={2} fill="url(#revenueFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors introduced by these two files.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/dashboard/DashboardCard.tsx src/components/dashboard/RevenueTrendChart.tsx
git commit -m "feat: add Recharts dependency, DashboardCard wrapper, and RevenueTrendChart"
```

---

### Task 7: `LowStockWidget`, `PendingDeliveriesWidget`, `RecentActivityWidget`

**Files:**
- Create: `src/components/dashboard/LowStockWidget.tsx`
- Create: `src/components/dashboard/PendingDeliveriesWidget.tsx`
- Create: `src/components/dashboard/RecentActivityWidget.tsx`

**Interfaces:**
- Consumes: `LowStockSummary` (Task 3), `PendingDeliveriesSummary` (Task 4), `RecentActivityItem` (Task 5).
- Produces:
  ```tsx
  export default function LowStockWidget({ summary }: { summary: LowStockSummary }): JSX.Element
  export default function PendingDeliveriesWidget({ summary }: { summary: PendingDeliveriesSummary }): JSX.Element
  export default function RecentActivityWidget({ items }: { items: RecentActivityItem[] }): JSX.Element
  ```
  Task 9 imports all three by these exact default-export names and prop shapes.

**Review tier: Sonnet** (presentational only — all three receive already-fetched, already-serialized data as props; no fetch calls of their own, matching `PendingDeliveriesSection.tsx`'s existing read-display components rather than its own fulfill-button variant, since these dashboard widgets are read-only summaries, not the full fulfillment UI).

- [ ] **Step 1: Create `src/components/dashboard/LowStockWidget.tsx`**

```tsx
import type { LowStockSummary } from '@/lib/dashboard/lowStockSummary'

export default function LowStockWidget({ summary }: { summary: LowStockSummary }) {
  return (
    <div className="space-y-3">
      {summary.totalCount === 0 ? (
        <p className="text-sm text-slate">No products are currently low on stock.</p>
      ) : (
        <>
          <p className="text-sm text-slate">
            <span className="font-mono text-base font-medium text-danger">{summary.totalCount}</span>{' '}
            product{summary.totalCount === 1 ? '' : 's'} at or below reorder threshold
          </p>
          <ul className="divide-y divide-mist">
            {summary.rows.map((row) => (
              <li key={`${row.branchId}_${row.productId}`} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {row.productName}
                  <span className="ml-2 text-xs text-slate">{row.branchName}</span>
                </span>
                <span className="font-mono text-danger">
                  {row.quantity} / {row.reorderThreshold}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/dashboard/PendingDeliveriesWidget.tsx`**

```tsx
import type { PendingDeliveriesSummary } from '@/lib/dashboard/pendingDeliveriesSummary'

export default function PendingDeliveriesWidget({ summary }: { summary: PendingDeliveriesSummary }) {
  return (
    <div className="space-y-3">
      {summary.totalCount === 0 ? (
        <p className="text-sm text-slate">No pending deliveries.</p>
      ) : (
        <>
          <p className="text-sm text-slate">
            <span className="font-mono text-base font-medium text-warning">{summary.totalCount}</span>{' '}
            {summary.totalCount === 1 ? 'delivery' : 'deliveries'} owed to customers
          </p>
          <ul className="divide-y divide-mist">
            {summary.rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {row.productName}
                  <span className="ml-2 text-xs text-slate">{row.branchName}</span>
                </span>
                <span className="font-mono text-ink">{row.quantityOwed}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/dashboard/RecentActivityWidget.tsx`**

```tsx
import type { RecentActivityItem } from '@/lib/dashboard/recentActivity'

const ACTION_LABELS: Partial<Record<RecentActivityItem['action'], string>> = {
  sale_create: 'New sale',
  sale_void: 'Sale voided',
  stock_adjust: 'Stock adjusted',
  stock_transfer: 'Stock transferred',
  pending_delivery_fulfilled: 'Delivery fulfilled',
  staff_create: 'Staff account created',
  staff_edit: 'Staff record edited',
  staff_delete: 'Staff account removed',
  permission_change: 'Role changed',
  product_create: 'Product added',
  product_edit: 'Product edited',
  product_delete: 'Product removed',
  service_create: 'Service added',
  service_edit: 'Service edited',
  service_delete: 'Service removed',
  supplier_create: 'Supplier added',
  supplier_edit: 'Supplier edited',
  supplier_delete: 'Supplier removed',
  customer_create: 'Customer added',
  customer_edit: 'Customer edited',
  customer_delete: 'Customer removed',
  leave_request_create: 'Leave requested',
}

export default function RecentActivityWidget({ items }: { items: RecentActivityItem[] }) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-slate">No recent activity.</p>
      ) : (
        <ul className="divide-y divide-mist">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {ACTION_LABELS[item.action] ?? item.action}
                {item.actorEmail && <span className="ml-2 text-xs text-slate">{item.actorEmail}</span>}
              </span>
              <span className="font-mono text-xs text-slate">{new Date(item.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new type errors. In particular, confirm `ACTION_LABELS`'s keys are all valid `AuditAction` values (a typo here is a silent no-op at runtime — the widget would just fall back to the raw action string — not a compile error, since the type is `Partial<Record<...>>`; double-check each of the 21 keys against `DASHBOARD_ACTIVITY_ACTIONS` from Task 5 by eye).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/LowStockWidget.tsx src/components/dashboard/PendingDeliveriesWidget.tsx src/components/dashboard/RecentActivityWidget.tsx
git commit -m "feat: add LowStockWidget, PendingDeliveriesWidget, RecentActivityWidget"
```

---

### Task 8: `AttendanceWidget` token restyle

**Files:**
- Modify: `src/components/attendance/AttendanceWidget.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — same default export, same props (none), same internal state machine and fetch calls. Task 9 renders this component unchanged (only its wrapping `DashboardCard` is new, added in Task 9).

**Review tier: Sonnet**, but the diff review must explicitly confirm every line outside a `className` string is byte-identical to the current file — same standard this project has applied to every prior "restyle only" touch (e.g. Phase 22's entity-table passes).

- [ ] **Step 1: Restyle the three button/text states**

In `src/components/attendance/AttendanceWidget.tsx`, replace only the `className` values (logic, state, fetch calls, JSX structure otherwise untouched):

Replace:
```tsx
          className="bg-black text-white rounded px-3 py-2 text-sm disabled:opacity-50"
```
(both occurrences — the Check In button and the Check Out button) with:
```tsx
          className="rounded-lg bg-ink px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-ink/90 disabled:opacity-50"
```

Replace both occurrences of:
```tsx
        {error && <p className="text-red-600 text-sm">{error}</p>}
```
with:
```tsx
        {error && <p className="text-sm text-danger">{error}</p>}
```

Replace:
```tsx
        <p className="text-sm text-zinc-600">Checked in at {formatTime(record.checkInAt)}</p>
```
with:
```tsx
        <p className="text-sm text-slate">Checked in at {formatTime(record.checkInAt)}</p>
```

Replace:
```tsx
      <p className="text-sm text-zinc-600">Done for today.</p>
      <p className="text-sm text-zinc-600">
```
with:
```tsx
      <p className="text-sm text-slate">Done for today.</p>
      <p className="text-sm text-slate">
```

- [ ] **Step 2: Verify it compiles and the diff is class-only**

Run: `npx tsc --noEmit`
Expected: no new type errors.

Run: `git diff src/components/attendance/AttendanceWidget.tsx`
Expected: every changed line is a `className` string; no change to `useState`/`useEffect`/`fetch(...)`/function names/conditional structure.

- [ ] **Step 3: Commit**

```bash
git add src/components/attendance/AttendanceWidget.tsx
git commit -m "style: restyle AttendanceWidget onto Phase 21 design tokens"
```

---

### Task 9: Dashboard page rewrite

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getSessionUser` (`src/lib/auth/server-guard.ts`), `hasCapability` (`src/lib/auth/permissions.ts`), `AttendanceWidget` (unchanged default export), `DashboardCard`/`RevenueTrendChart` (Task 6), `LowStockWidget`/`PendingDeliveriesWidget`/`RecentActivityWidget` (Task 7), `buildRevenueTrend` (Task 2), `getDashboardLowStock` (Task 3), `getDashboardPendingDeliveries` (Task 4), `getRecentActivity` (Task 5).
- Produces: the page itself — no exports consumed by later tasks (this is the last task).

**Review tier: Sonnet** (pure composition — capability checks gate which already-tested lib function gets called and which already-tested widget gets rendered; no new business logic).

- [ ] **Step 1: Rewrite `src/app/(dashboard)/dashboard/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import AttendanceWidget from '@/components/attendance/AttendanceWidget'
import DashboardCard from '@/components/dashboard/DashboardCard'
import RevenueTrendChart from '@/components/dashboard/RevenueTrendChart'
import LowStockWidget from '@/components/dashboard/LowStockWidget'
import PendingDeliveriesWidget from '@/components/dashboard/PendingDeliveriesWidget'
import RecentActivityWidget from '@/components/dashboard/RecentActivityWidget'
import { buildRevenueTrend } from '@/lib/dashboard/revenueTrend'
import { getDashboardLowStock } from '@/lib/dashboard/lowStockSummary'
import { getDashboardPendingDeliveries } from '@/lib/dashboard/pendingDeliveriesSummary'
import { getRecentActivity } from '@/lib/dashboard/recentActivity'

export default async function DashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const canViewRevenue = hasCapability(user.role, 'reports.sales.view')
  const canViewLowStock = hasCapability(user.role, 'inventory.stock.view')
  const canViewDeliveries = hasCapability(user.role, 'pos.delivery.fulfill')
  const canViewActivity = hasCapability(user.role, 'dashboard.activity.view')

  const [revenueTrend, lowStock, deliveries, activity] = await Promise.all([
    canViewRevenue ? buildRevenueTrend(user) : Promise.resolve(null),
    canViewLowStock ? getDashboardLowStock(user) : Promise.resolve(null),
    canViewDeliveries ? getDashboardPendingDeliveries(user) : Promise.resolve(null),
    canViewActivity ? getRecentActivity(user) : Promise.resolve(null),
  ])

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Welcome, {user.email}</h1>
        <p className="text-sm text-slate">
          Role: <span className="font-medium text-ink">{user.role}</span> &middot; Branch:{' '}
          <span className="font-medium text-ink">{user.branchId}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DashboardCard title="Check In">
          <AttendanceWidget />
        </DashboardCard>
        {canViewRevenue && revenueTrend && (
          <DashboardCard title="Revenue — last 30 days">
            <RevenueTrendChart data={revenueTrend} />
          </DashboardCard>
        )}
        {canViewLowStock && lowStock && (
          <DashboardCard title="Low stock">
            <LowStockWidget summary={lowStock} />
          </DashboardCard>
        )}
        {canViewDeliveries && deliveries && (
          <DashboardCard title="Pending deliveries">
            <PendingDeliveriesWidget summary={deliveries} />
          </DashboardCard>
        )}
        {canViewActivity && activity && (
          <DashboardCard title="Recent activity">
            <RecentActivityWidget items={activity} />
          </DashboardCard>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all pre-existing tests plus every new test added in Tasks 1–5 pass (424 + ~13 new).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: replace placeholder dashboard with the four role-gated Phase 23 widgets"
```

---

## After all tasks: deployment and live verification (not part of any task above)

- `firestore.indexes.json`'s two new `pendingDeliveries` composite indexes (Task 4) must be deployed to `erp-lfd` via `firebase deploy --only firestore:indexes` before the pending-deliveries widget will work in production — this needs its own explicit go-ahead, per this project's standing practice for any Firebase deployment. Local tests will pass without this deploy (the emulator doesn't enforce it); production will not.
- Live verification checklist (run with real `erp-lfd` accounts, one per role, per this project's established practice — matches the design's exit criteria):
  - Check-In still works identically (check in, see the checked-in state, check out).
  - A `super_admin` sees all four widgets plus Check-In; a `cashier` sees only Check-In and Pending Deliveries (holds `pos.delivery.fulfill`, not the other three); a `branch_manager` sees all five, scoped to their own branch on revenue/low-stock/deliveries/activity; a `general_manager` sees revenue/deliveries/activity org-wide but not low-stock (lacks `inventory.stock.view`); a `finance_admin` sees only revenue (org-wide) plus Check-In.
  - Revenue chart total matches a manually-computed sum from `/reports/sales` for the same 30-day window and role.
  - Low-stock widget count matches `/stock`'s own low-stock rows for that role's visible branch scope.
  - Recent activity never surfaces a clinical/lab/appointment/intake/seminar/messaging/login action, confirmed by triggering one of each and checking it does not appear.
