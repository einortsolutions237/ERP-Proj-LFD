# Phase 25 — Dashboard/Checkout Fixes + Reports & Settings Design Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two real, screenshot-confirmed presentation issues (dashboard card height stretch, loud solid-color payment tenders in Checkout) and extend the established structural design system (rounded-2xl cards, `--shadow-card`, the tint/badge idiom, monospace/right-aligned numeric cells, styled forms/tables/empty-states) to Sales Report, Stock Report, and Settings — the next tranche after Dashboard.

**Architecture:** Six independent, presentation-only changes across five tasks. No data-fetching, validation, or capability-gating logic touched anywhere. `CheckoutForm.tsx`'s task carries this project's highest verification bar (Opus review, byte-identical-outside-className confirmed directly), matching every prior touch to that file since Phase 9.

**Tech Stack:** Next.js App Router, React Server/Client Components, Tailwind CSS v4 (tokens via `@theme inline` in `globals.css`).

## Global Constraints

- No new or changed color/font tokens. Every class below resolves to a token already in `globals.css`: `marine`, `brass`, `danger`, `info`, `mist`, `slate`, `ink`, `paper`, `surface`, plus `--shadow-card`.
- Zero changes to any capability gate, data-fetching function, validation logic, or Firestore write path anywhere in this phase.
- Established structural conventions, confirmed by reading Phase 22's already-shipped reference components (`ProductTable.tsx`, `CustomerTable.tsx`, `ProductForm.tsx`) directly before writing this plan — reuse these exactly, don't invent variants:
  - Page h1: `font-display text-2xl font-semibold text-ink`
  - Table wrapper: `overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]`
  - Table header row: `bg-mist/40`; header cell: `px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate`
  - Table body: `divide-y divide-mist` on `<tbody>`; row: `hover:bg-mist/40 transition-colors duration-200`; cell: `px-3 py-2 text-ink`; numeric cell adds `font-mono text-right`
  - In-table empty state (a real table with columns, matching `CustomerTable.tsx`'s exact pattern): `<tr><td colSpan={N} className="px-3 py-4 text-center text-slate">No X found</td></tr>`
  - Standalone empty-state paragraph (matching every dashboard widget/section): `<p className="text-sm text-slate">...</p>`
  - Text input: `w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine` (add `font-mono` for numeric inputs)
  - Select: `w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine`
  - Form label: `block text-sm font-medium text-ink`
  - Primary button: `rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50` (or `text-sm` variant alongside inline form controls)
  - Status/urgency pill (matching `ProductTable.tsx`'s active/inactive pills exactly): `inline-block rounded-full bg-{tone}/10 px-2 py-0.5 text-xs font-medium text-{tone}`
  - "Edit"-style link: `text-marine underline-offset-2 hover:underline`; "Delete"-style action: `text-danger underline-offset-2 hover:underline disabled:text-slate disabled:no-underline`
  - Error text: `text-sm text-danger`
  - Card (non-table): `rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]`
- **Low-stock row treatment** (the plan's one real design decision, stated up front per this project's convention): confirmed by reading `LowStockWidget.tsx` directly that this app's *existing* low-stock urgency idiom is a colored quantity value (`font-mono text-danger`), not a red-flooded row. The Stock Report's low-stock rows get the *same* colored-quantity treatment (matching the established idiom exactly) plus a subtle row wash (`bg-danger/5`, the same `/5` DashboardCard's `TONE_STYLES` established in Phase 24) replacing the current `bg-red-50 text-red-700` raw-Tailwind full-row-red treatment. This is not a literal token swap of the same shape — the rest of the row's text stays neutral `text-ink`; only the quantity cell is colored.
- This app has no component-rendering test framework — verification is direct full-file reads (old vs. new) plus live browser check where reachable, matching Phase 22's established standard for presentation-only phases.
- **`CheckoutForm.tsx` is this project's most protected file.** Task 2's implementer and reviewer must each independently confirm, by reading the whole file before and after, that every line outside the two constant objects (`TENDER_CHIP_CARD`, and the new `TENDER_GLYPH_COLOR`) and the one glyph-className line is byte-identical — the three-way payment split logic, `updatePayment`, `hasAmount`, `balanceDue`/`paymentsSum`/`total`, `submitDisabled`, the conditional reference-code fields, and the submit handler must not change in any way.

---

### Task 1: Fix 1 — dashboard card height imbalance

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx:53`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — pure class-string change on the grid container

- [ ] **Step 1: Confirm the fix is safe before making it**

Read `src/components/dashboard/DashboardCard.tsx` (already confirmed in this plan's own research: it is a plain `<div className="rounded-2xl border border-mist p-4 shadow-[var(--shadow-card)] {wash}">`, no `h-full`, `flex-1`, or `justify-between` anywhere) — nothing in it relies on being stretched to a matched row height. No card currently depends on uniform height for a design reason; the stretch is CSS Grid's default `align-items: stretch` behavior, an unintended side effect, not a deliberate choice.

- [ ] **Step 2: Apply the fix**

In `src/app/(dashboard)/dashboard/page.tsx` line 53, change:

```tsx
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
```

to:

```tsx
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
```

No other line in this file changes.

- [ ] **Step 3: Verify live**

With the dev server running and the browser connected: navigate to `/dashboard` as `super_admin` (all 8 cards render). Screenshot. Confirm each card's height now matches its own content — "Check In" and "Upcoming appointments" (short content) no longer stretch to match "Revenue"/"Recent activity" (tall content) in the same row; no large empty voids under short cards.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "fix: dashboard cards size to their own content, not row-stretched"
```

---

### Task 2: Fix 2 — restrained payment method colors in Checkout

**Files:**
- Modify: `src/components/pos/CheckoutForm.tsx:39-46` (the `TENDER_CHIP_CARD` constant and its comment), and the glyph render site (currently line 561)

**Interfaces:**
- Consumes: nothing new
- Produces: a new `TENDER_GLYPH_COLOR` constant (module-private, not exported) — no external interface changes

- [ ] **Step 1: Read the whole file first and catalog every stateful/logic-bearing line**

Read `src/components/pos/CheckoutForm.tsx` in full. List (in your report) every `useState`, every derived value (`paymentsSum`, `balanceDue`, `total`, `submitDisabled`, etc.), every handler (`updatePayment`, the submit handler, the offline-queue path), and every conditional render tied to `payments`/`cart`/`customerId`. This catalog is your baseline — after editing, every one of these must be provably unchanged.

- [ ] **Step 2: Replace the `TENDER_CHIP_CARD` constant and its comment**

Currently (lines 39-46):

```tsx
// Tender-chip background per payment method — cash stays deliberately quiet
// (neutral default), the two mobile-money brands lean on their approved
// tokens for real color identity (see design brief, Phase 9 Task 3).
const TENDER_CHIP_CARD: Record<PaymentMethod, string> = {
  cash: 'bg-mist text-ink',
  mtn_momo: 'bg-brass text-ink',
  orange_money: 'bg-info text-white',
}
```

Replace with:

```tsx
// Tender-chip background per payment method — cash stays deliberately quiet
// (neutral default). Phase 25 replaced MTN MoMo/Orange Money's solid brand
// fills with the same /10-badge, /5-wash tint idiom DashboardCard's
// TONE_STYLES established in Phase 24, instead of flooding the section
// with a loud solid color block.
const TENDER_CHIP_CARD: Record<PaymentMethod, string> = {
  cash: 'bg-mist text-ink',
  mtn_momo: 'bg-brass/5 text-ink border border-brass/30',
  orange_money: 'bg-info/5 text-ink border border-info/30',
}

// Icon color per method — carries the brand identity that used to come
// from the solid fill; the label text stays neutral ink, matching
// DashboardCard's badge-icon-colored/title-neutral split.
const TENDER_GLYPH_COLOR: Record<'mtn_momo' | 'orange_money', string> = {
  mtn_momo: 'text-brass',
  orange_money: 'text-info',
}
```

- [ ] **Step 3: Update the glyph's className at the render site**

Find the line (currently line 561):

```tsx
                    {p.method !== 'cash' && <TenderGlyph method={p.method} className="h-4 w-4 opacity-70" />}
```

Replace with:

```tsx
                    {p.method !== 'cash' && (
                      <TenderGlyph method={p.method} className={`h-4 w-4 ${TENDER_GLYPH_COLOR[p.method]}`} />
                    )}
```

No other line in the payment-row render block (the outer `<div>`'s className template, the amount `<input>`, the reference `<input>`, the cash-only folded-corner decoration) changes — the outer `<div>` already reads `` `relative overflow-hidden rounded-lg p-3 ${TENDER_CHIP_CARD[p.method]}` ``, which picks up the new values automatically with no structural edit needed there.

- [ ] **Step 4: Confirm byte-identical outside the three changes above**

Read the whole file again, post-edit. Diff mentally against your Step 1 catalog: every `useState`, every derived value, every handler, every conditional must match exactly. Confirm in your report, explicitly, that `updatePayment`, `hasAmount`, `balanceDue`, `paymentsSum`, `total`, `submitDisabled`, the reference-code conditional (`p.method === 'mtn_momo' || p.method === 'orange_money'`), and the submit handler are untouched.

- [ ] **Step 5: Verify live**

With the dev server running and the browser connected: sign in as `cashier`, navigate to `/pos`, add an item to the cart. Screenshot the Payment section. Confirm: Cash still neutral/gray, MTN MoMo now a light amber/brass tint with a brass border and brass-colored icon (not a solid amber block), Orange Money now a light blue tint with a blue border and blue-colored icon (not a solid blue block with white text). Complete a real checkout run (add item, split cash + one mobile-money method with a reference code, submit) to confirm the payment logic itself is unaffected — same rigor as Phase 24's live verification of this exact page.

- [ ] **Step 6: Commit**

```bash
git add src/components/pos/CheckoutForm.tsx
git commit -m "fix: restrained tint/border treatment for MTN MoMo and Orange Money tenders"
```

---

### Task 3: Sales Report structural design rollout

**Files:**
- Modify: `src/app/(dashboard)/reports/sales/page.tsx` (JSX only — lines 77-233; every line above line 77 is data logic and stays byte-identical)
- Modify: `src/components/reports/DownloadCsvButton.tsx` (styling only — no logic change)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — `SalesReportPage`'s props/behavior and `DownloadCsvButton`'s props are unchanged

- [ ] **Step 1: Confirm what's already correct**

Read `src/app/(dashboard)/reports/sales/page.tsx` lines 1-76 (all logic: `requireCapability`, `buildSalesReport`, `sortedTopSellers`, `sortLinkParams`, `csv`) and confirm none of it needs to change — colors/fonts are already inherited from the global cascade wherever no explicit class overrides them; the only work is replacing raw Tailwind defaults (`gray-500`, `red-600`, `black`, plain `border rounded`) with this app's own tokens and adding the structural treatments named in Global Constraints.

- [ ] **Step 2: Replace the return JSX**

Replace lines 77-233 (the full `return (...)` block) with:

```tsx
  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Sales report</h1>

      <form method="GET" className="flex items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-ink">Start date</label>
          <input
            type="date"
            name="startDate"
            defaultValue={startValue}
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">End date</label>
          <input
            type="date"
            name="endDate"
            defaultValue={endValue}
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
          />
        </div>
        <button type="submit" className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-opacity duration-200 disabled:opacity-50">
          View
        </button>
      </form>

      {rangeError && <p className="text-sm text-danger">{rangeError}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Revenue</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.revenueTotal.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Sales</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.nonVoidedCount}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Average sale</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.averageSaleValue.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Voided count</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.voidedCount}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Voided total</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.voidedTotal.toFixed(2)}</div>
            </div>
          </div>

          <DownloadCsvButton filename="sales-report.csv" csv={csv} />

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">By branch</h2>
            {report.byBranch.length === 0 ? (
              <p className="text-sm text-slate">No sales in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Revenue</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {report.byBranch.map((row) => (
                      <tr key={row.branchId} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.branchName}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.revenue.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">By payment method</h2>
            {report.byPaymentMethod.length === 0 ? (
              <p className="text-sm text-slate">No payments in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Method</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {report.byPaymentMethod.map((row) => (
                      <tr key={row.method} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.method}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">Top sellers</h2>
            <p className="text-sm text-slate mb-2">
              Sort by:{' '}
              {sortBy === 'revenue' ? (
                <span className="font-medium text-ink">Revenue</span>
              ) : (
                <Link href={sortLinkParams('revenue')} className="text-marine underline-offset-2 hover:underline">
                  Revenue
                </Link>
              )}
              {' | '}
              {sortBy === 'quantity' ? (
                <span className="font-medium text-ink">Quantity</span>
              ) : (
                <Link href={sortLinkParams('quantity')} className="text-marine underline-offset-2 hover:underline">
                  Quantity
                </Link>
              )}
            </p>
            {sortedTopSellers.length === 0 ? (
              <p className="text-sm text-slate">No items sold in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Quantity</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {sortedTopSellers.map((row) => (
                      <tr key={`${row.type}:${row.itemId}`} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.type}</td>
                        <td className="px-3 py-2 text-ink">{row.name}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.quantity}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Restyle the shared `DownloadCsvButton`**

Replace `src/components/reports/DownloadCsvButton.tsx` entirely:

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
    <button
      type="button"
      onClick={handleClick}
      className="rounded-lg border border-mist px-3 py-1.5 text-sm text-ink transition-colors duration-200 hover:bg-mist"
    >
      Download CSV
    </button>
  )
}
```

Only the `className` on the `<button>` changed — `handleClick`'s blob/anchor-download logic is untouched.

- [ ] **Step 4: Verify live**

With the dev server running and the browser connected: sign in as `super_admin` or `finance_admin`, navigate to `/reports/sales`. Screenshot both the default (populated) state and, if reachable, a date range with zero sales (to see the empty-state paragraphs render correctly). Confirm stat tiles are cards with shadow/radius, tables have the rounded-2xl wrapper and header-row tint, numeric columns are monospace and right-aligned, the CSV button and sort links use marine, and the date-filter form is properly styled.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/reports/sales/page.tsx" src/components/reports/DownloadCsvButton.tsx
git commit -m "style: structural design rollout for Sales Report"
```

---

### Task 4: Stock Report structural design rollout

**Files:**
- Modify: `src/app/(dashboard)/reports/inventory/page.tsx` (JSX only — lines 32-103; every line above line 32 is data logic and stays byte-identical)

**Interfaces:**
- Consumes: `DownloadCsvButton` (already restyled by Task 3 — this task just uses it, no further change needed to that component)
- Produces: nothing new

- [ ] **Step 1: Confirm what's already correct**

Read `src/app/(dashboard)/reports/inventory/page.tsx` lines 1-31 (`requireCapability`, `buildInventoryReport`, the `csv` construction using `row.lowStock`) and confirm none of it needs to change. `row.lowStock` is already computed server-side by `buildInventoryReport` using the shared `isLowStock()` helper (confirmed in `CLAUDE.md`'s Phase 7 note) — this task only changes how `row.lowStock === true` is *rendered*, never how it's computed.

- [ ] **Step 2: Replace the return JSX**

Replace lines 32-103 (the full `return (...)` block) with:

```tsx
  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Inventory report</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
          <div className="text-xs text-slate">Total value</div>
          <div className="font-mono text-lg font-semibold text-ink">{report.totalValue.toFixed(2)}</div>
        </div>
      </div>

      <DownloadCsvButton filename="inventory-report.csv" csv={csv} />

      <section>
        <h2 className="text-lg font-medium text-ink mb-2">By branch</h2>
        {report.byBranch.length === 0 ? (
          <p className="text-sm text-slate">No stock recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Total value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {report.byBranch.map((row) => (
                  <tr key={row.branchId} className="hover:bg-mist/40 transition-colors duration-200">
                    <td className="px-3 py-2 text-ink">{row.branchName}</td>
                    <td className="px-3 py-2 font-mono text-right text-ink">{row.totalValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-ink mb-2">Stock levels</h2>
        {report.rows.length === 0 ? (
          <p className="text-sm text-slate">No stock recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Quantity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reorder threshold</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {report.rows.map((row) => (
                  <tr
                    key={`${row.productId}:${row.branchId}`}
                    className={`hover:bg-mist/40 transition-colors duration-200 ${row.lowStock ? 'bg-danger/5' : ''}`}
                  >
                    <td className="px-3 py-2 text-ink">{row.productName}</td>
                    <td className="px-3 py-2 text-ink">{row.branchName}</td>
                    <td className={`px-3 py-2 font-mono text-right ${row.lowStock ? 'text-danger' : 'text-ink'}`}>
                      {row.quantity}
                    </td>
                    <td className="px-3 py-2 font-mono text-right text-ink">{row.reorderThreshold}</td>
                    <td className="px-3 py-2 font-mono text-right text-ink">{row.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
```

Note the low-stock treatment applied per Global Constraints: the row gets a subtle `bg-danger/5` wash, and only the Quantity cell's text is colored (`text-danger`, matching `LowStockWidget.tsx`'s exact existing idiom) — the rest of the row's cells stay neutral `text-ink`.

- [ ] **Step 3: Verify live**

With the dev server running and the browser connected: sign in as a role with `reports.inventory.view`, navigate to `/reports/inventory`. Screenshot. Confirm the low-stock rows show a subtle red wash with a colored quantity number, not a solid red-flooded row; confirm all tables/cards match Task 3's Sales Report treatment for visual consistency between the two report pages (the "dedicated final review pass checking for drift between independently-styled screens" practice this project has repeated since Phase 10).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/reports/inventory/page.tsx"
git commit -m "style: structural design rollout for Stock Report, tinted low-stock rows"
```

---

### Task 5: Settings structural design rollout

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx` (h1 only)
- Modify: `src/components/settings/SettingsTable.tsx` (JSX only — every `useState`, every handler, `parseInput`, `inferType` stay byte-identical)

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — `SettingsTable`'s `settings` prop and all its handlers are unchanged

- [ ] **Step 1: Confirm what's already correct**

Read `src/components/settings/SettingsTable.tsx` lines 1-117 (`inferType`, `parseInput`, `submitUpsert`, `handleAdd`, `handleSaveEdit`, `handleDelete`, and every `useState`) and confirm none of it needs to change. This task is presentation-only.

- [ ] **Step 2: Update the page h1**

In `src/app/(dashboard)/settings/page.tsx` line 30, change:

```tsx
        <h1 className="text-xl font-semibold">Settings</h1>
```

to:

```tsx
        <h1 className="font-display text-2xl font-semibold text-ink">Settings</h1>
```

No other line in this file changes.

- [ ] **Step 3: Replace `SettingsTable`'s return JSX**

Replace lines 118-238 (the full `return (...)` block) of `src/components/settings/SettingsTable.tsx` with:

```tsx
  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="rounded-2xl border border-mist bg-surface p-4 shadow-[var(--shadow-card)] space-y-3">
        <h2 className="text-sm font-medium text-ink">Add setting</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
            placeholder="key (e.g. business.timezone)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <select
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
            value={newType}
            onChange={(e) => setNewType(e.target.value as ValueType)}
          >
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          {newType === 'boolean' ? (
            <select
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            >
              <option value="">choose...</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
          )}
          <button
            type="button"
            disabled={busyKey !== null}
            onClick={handleAdd}
            className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-opacity duration-200 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Key</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Value</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Updated</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {settings.map((row) => (
              <tr key={row.key} className="hover:bg-mist/40 transition-colors duration-200">
                <td className="px-3 py-2 font-mono text-ink">{row.key}</td>
                <td className="px-3 py-2 text-ink">
                  {editingKey === row.key ? (
                    <input
                      className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                    />
                  ) : (
                    String(row.value)
                  )}
                </td>
                <td className="px-3 py-2 text-slate">{row.updatedAt}</td>
                <td className="px-3 py-2 space-x-3">
                  {editingKey === row.key ? (
                    <>
                      <button
                        type="button"
                        disabled={busyKey === row.key}
                        onClick={() => handleSaveEdit(row)}
                        className="text-marine underline-offset-2 hover:underline disabled:text-slate disabled:no-underline"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingKey(null)}
                        className="text-marine underline-offset-2 hover:underline"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingKey(row.key)
                          setEditValue(String(row.value))
                          setError(null)
                        }}
                        className="text-marine underline-offset-2 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyKey === row.key}
                        onClick={() => handleDelete(row)}
                        className="text-danger underline-offset-2 hover:underline disabled:text-slate disabled:no-underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {settings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate">
                  No settings configured yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

This adds the empty-state row the brief names as currently missing (`settings.length === 0`, matching `CustomerTable.tsx`'s exact in-table empty-state pattern) — nothing else about the table's data or row logic changes.

- [ ] **Step 4: Verify live**

With the dev server running and the browser connected: sign in as a role with `admin.settings.manage`, navigate to `/settings`. Screenshot the add-setting card and the table (both with existing settings, and — if reachable by temporarily viewing a state with none, or by reasoning from the code — confirm the empty-state row would render correctly for zero settings). Confirm the native `<select>` now has visible border/padding matching the rest of the app's selects, and the add-setting box reads as a real card, not a bare bordered box.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/settings/page.tsx" src/components/settings/SettingsTable.tsx
git commit -m "style: structural design rollout for Settings, add missing empty state"
```
