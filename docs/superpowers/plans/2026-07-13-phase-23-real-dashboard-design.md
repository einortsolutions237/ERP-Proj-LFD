# Phase 23 — Real Dashboard (Core Widgets) — Design

**Status:** approved, not yet implemented.

## Goal

Replace the placeholder "Welcome / Check In" landing page (`src/app/(dashboard)/dashboard/page.tsx`) with a real, role-aware dashboard: a revenue trend chart, low-stock alerts, pending deliveries, and a recent-activity feed. Unlike every design phase since Phase 9, this is genuinely new functionality — real data-aggregation logic behind each widget, not presentation-only.

The existing Check-In feature (Phase 5's `hr.attendance.self` self-check-in, `AttendanceWidget.tsx`) must survive this redesign, incorporated into the new layout, not dropped.

Out of scope, explicitly deferred to Phase 23.1: appointments, lab orders, leave approvals, and any other role-specialized widget beyond these four core ones.

## A. Page architecture

`src/app/(dashboard)/dashboard/page.tsx` stays a Server Component. It calls each widget's data-fetching function directly and in-process — the same pattern already established for `getPendingDeliveries`/`getAppointments`/`getLabRecords` on the customer detail page — rather than adding new API routes. Each widget's lib function re-checks its own capability internally (belt-and-suspenders, matching that precedent); the page additionally checks `hasCapability` before calling a widget's function at all, so a role with none of the four capabilities never triggers those reads.

Layout: a responsive card grid (`rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]`, matching `StaffTable.tsx`'s established card convention) — 1 column on mobile, 2 on desktop. Check-In renders as its own card in the same grid, always first, for every role (unchanged capability — `hr.attendance.self` is universal, `ALL_ROLES`).

Widgets render independently — a role with only some of the four relevant capabilities sees exactly those widgets, not all four or none. No page-level all-or-nothing gate.

## B. New capability — `dashboard.activity.view`

New module `'dashboard'` added to `MODULES` in `src/lib/auth/permissions.ts`. New capability `dashboard.activity.view`, backed by a standalone constant — **not** composed from `GENERAL_MANAGER_BRANCH_MGR` by reference, even though membership currently matches it exactly. This follows the same future-proofing discipline this file already applies to `LAB_ORDER_ROLES`/`INTAKE_VIEW_ROLES`: the membership match with `GENERAL_MANAGER_BRANCH_MGR` (which backs `admin.departments.manage`/`pos.sale.void`) is coincidental, not a real relationship — a future change to department-management or sale-void authority must not silently also change dashboard-activity visibility.

```ts
// Backs dashboard.activity.view only. Membership currently matches
// GENERAL_MANAGER_BRANCH_MGR but the two capabilities are semantically
// unrelated — standalone so a future change to department-management/
// sale-void authority can't silently also change dashboard visibility.
const DASHBOARD_ACTIVITY_ROLES: RoleId[] = ['super_admin', 'general_manager', 'branch_manager']
```

**Visibility rule, stated explicitly (this is the one genuinely new access decision in this phase):**
- `branch_manager` sees whitelisted `auditLogs` entries where `branchId === viewer.branchId` **or** `branchId === null` (org-wide catalog actions — a price change affects their branch too, so it's shown, not hidden).
- `general_manager`/`super_admin` see every whitelisted entry, unfiltered, org-wide.
- No other role gets this widget at all, regardless of branch.

**Curated action-type whitelist** (approved): `sale_create`, `sale_void`, `stock_adjust`, `stock_transfer`, `pending_delivery_fulfilled`, `staff_create`, `staff_edit`, `staff_delete`, `permission_change`, `product_create`, `product_edit`, `product_delete`, `service_create`, `service_edit`, `service_delete`, `supplier_create`, `supplier_edit`, `supplier_delete`, `customer_create`, `customer_edit`, `customer_delete`, `leave_request_create`.

Explicitly excluded: every clinical/lab/appointment/intake/seminar-attendance/messaging audit action (all patient- or private-communication-adjacent, walled off from `branch_manager`/`general_manager` everywhere else in this app — a dashboard widget must not become a side channel around that wall), and `login`/`login_failed`/`logout` (security telemetry, not business activity).

## C. Widget 1 — Revenue trend chart

New `buildRevenueTrend(user, days = 30)` in `src/lib/dashboard/revenueTrend.ts`. Reuses the exact same query shape as `buildSalesReport` (`src/lib/reports/sales.ts`) — `role === 'branch_manager'` branch-scoping, deliberately **not** `isBranchLocked` — matching `GET /api/reports/sales`'s existing, unchanged-since-Phase-20 scoping convention, since this reuses the same `reports.sales.view` capability and should behave identically for who sees what. Reuses the existing `(branchId, createdAt)` sales composite index — no new index needed. Voided sales excluded from revenue, matching every other revenue computation in this app.

New logic (not present in `buildSalesReport`): buckets non-voided `sale.total` by UTC calendar day across the fixed 30-day window, returning `Array<{ date: string; revenue: number }>`. No range selector this phase — fixed default only, keeping "core widgets" scope tight; a selector is easy to add in a follow-up if wanted.

Gated on `reports.sales.view` (`REPORTS_ROLES`: `super_admin`, `general_manager`, `branch_manager`, `finance_admin`).

## D. Widget 2 — Low-stock alerts

New `getDashboardLowStock(viewer)` in `src/lib/dashboard/lowStockSummary.ts`. Gated on `inventory.stock.view`, which today is held only by `super_admin`/`branch_manager` (`BRANCH_MANAGER_ONLY`) — an existing, unrelated fact about this capability's current membership, not something this phase changes; the widget will only ever render for those two roles as a result.

Scoped via `isBranchLocked(role)` — matching `stock/page.tsx`'s Phase-12-fixed convention. Deliberately **not** `buildInventoryReport`'s `role === 'branch_manager'` pattern (`src/lib/reports/inventory.ts`), since that function is gated on the different `reports.inventory.view` capability and uses that capability's own scoping convention — reusing it wholesale here would apply the wrong scoping mechanism to a different capability.

Joins `productStock` + `products` (same pattern as `buildInventoryReport`), filters with the shared `isLowStock()` directly — no reimplementation of the threshold check. Returns the top 5 rows by how far under threshold, plus a total low-stock count.

## E. Widget 3 — Pending deliveries

New `getDashboardPendingDeliveries(viewer)` in `src/lib/dashboard/pendingDeliveriesSummary.ts` — same query shape as `getPendingDeliveries` (`isBranchLocked` scoping) but org/branch-wide instead of per-customer, filtered to `status === 'pending'`. Gated on `pos.delivery.fulfill` (`POS_DELIVERY_FULFILL_ROLES`: `super_admin`, `general_manager`, `branch_manager`, `cashier`). Returns the top 5 rows oldest-first, plus a total pending count.

## F. Widget 4 — Recent activity feed

New `getRecentActivity(viewer)` in `src/lib/dashboard/recentActivity.ts`. Gated on `dashboard.activity.view` (section B).

Deliberately avoids adding a new composite index: rather than `where('action','in',[...]).where('branchId','in',[...])` (Firestore forbids two `in` clauses in one query, and this shape would need a new composite index — the exact class of gap this project's own review history has flagged before, e.g. Phase 19.2's `labOrders(status, orderedAt)` index), it fetches the most recent ~300 `auditLogs` entries ordered by `createdAt desc` (a single-field ordering that's already implicitly indexed) and filters in-memory for the action whitelist and the section-B branch rule, returning the first 10 matches.

Trade-off, stated explicitly: if a branch's most recent matching action falls outside the 300-entry global window, it won't surface on the widget. Acceptable for a "recent activity" feed (bounded recency is the feature), not acceptable if this function were ever repurposed as a report — do not reuse `getRecentActivity` for anything claiming completeness.

## G. Chart

Recharts (new dependency — approved; justified by likely reuse in Phase 23.1's role-specialized widgets and future report visualizations, not a one-off). `<ResponsiveContainer>` + `<AreaChart>` inside a new `'use client'` component, `RevenueTrendChart.tsx`, that receives already-fetched data as props from the Server Component — no client-side data fetching, no fetch waterfall. Styled with the `marine` token for the line/area fill, `mist` for gridlines, `tabular-nums`/JetBrains Mono for axis labels, matching every other numeric-column convention in this app.

## H. AttendanceWidget restyle

Approved: swap `bg-black`/`text-zinc-600`/`text-red-600` for this app's token equivalents (`ink`/`slate`/`danger`, button treatment matching the rest of the app), wrapped in the same card treatment as its new sibling widgets. Check-in/out state machine and fetch calls are untouched — confirmed byte-identical logic, only class names change. Same reasoning as Phase 22 extending Phase 21's conventions to already-existing files it happened to touch.

## I. Testing

New Vitest suite (`tests/unit/dashboardActivity.test.ts` or integration if it needs emulator data) covering:
- The `dashboard.activity.view` role×capability grant (only `super_admin`/`general_manager`/`branch_manager`, nobody else).
- The branch-vs-org-wide activity filter (mirroring `isBranchLocked` test conventions from Phase 20.1) — a `branch_manager` sees own-branch entries plus `branchId: null` entries, not another branch's.
- `getDashboardLowStock`'s reuse of `isLowStock` at the exact boundary (`quantity === reorderThreshold`), not a reimplemented comparison.
- The action-type whitelist actually excludes a sample clinical/lab/messaging audit action even when present in the underlying `auditLogs` window.

Matches this project's established practice (Phase 20.1) of testing new access-control logic directly, not just through UI.

## I.5 Timestamp serialization

All four new lib functions return Firestore `Timestamp` fields (`createdAt`, `fulfilledAt`, etc.) already converted to ISO strings (`.toDate().toISOString()`) — the same discipline `getPendingDeliveries`/`getAppointments` already follow — never a raw `Timestamp` passed from the Server Component into a `'use client'` component's props. `revenueTrend`'s `date` field is a plain `'YYYY-MM-DD'` string bucket, not a Timestamp, so it's exempt by construction. This is called out explicitly because a Timestamp leak into a client boundary is a recurring class of bug this project's review process has caught before.

## J. Files touched / added

No existing route, capability, or business logic changes anywhere else in the app.

**New:**
- `src/lib/dashboard/revenueTrend.ts`
- `src/lib/dashboard/lowStockSummary.ts`
- `src/lib/dashboard/pendingDeliveriesSummary.ts`
- `src/lib/dashboard/recentActivity.ts`
- `src/components/dashboard/RevenueTrendChart.tsx`
- `src/components/dashboard/LowStockWidget.tsx`
- `src/components/dashboard/PendingDeliveriesWidget.tsx`
- `src/components/dashboard/RecentActivityWidget.tsx`
- New test file(s) per section I

**Modified:**
- `src/lib/auth/permissions.ts` (new capability + `DASHBOARD_ACTIVITY_ROLES` constant + `MODULES` entry)
- `src/app/(dashboard)/dashboard/page.tsx` (full rewrite — placeholder replaced with widget grid)
- `src/components/attendance/AttendanceWidget.tsx` (restyle only, logic untouched)
- `package.json` (+`recharts`)
- `firestore.rules` — expected no change (`auditLogs`/`productStock`/`pendingDeliveries`/`sales` are already closed collections, read only via the Admin SDK server-side); confirm this holds during implementation rather than assuming it going in.

## Exit criteria

- Check-In works identically to before, confirmed directly (not assumed).
- Revenue chart renders real data computed at request time, gated on `reports.sales.view`.
- Low-stock alerts reuse the existing shared `isLowStock` logic, not a reimplementation.
- Pending deliveries and the recent-activity feed both render correctly, with the new activity-visibility rule (section B) correctly scoped.
- Each widget is independently gated — verified live with a role holding only some of the four capabilities.
- No existing route, capability, or business logic changed anywhere else in the app.
