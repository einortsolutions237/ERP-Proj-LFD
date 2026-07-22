# Phase 37 — Targeted Fixes from Phase 36's Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six small, independent, code-level fixes for the Important findings from Phase 36's UI/UX assessment — POS backorder visibility, the offline-sync recovery popover, a raw branch ID on the Dashboard, a silent permission-denial redirect, the `success`/`warning` WCAG contrast tokens, and removal of two leftover QA test customers from the live checkout picker.

**Architecture:** No schema changes, no new capabilities, no business-logic changes. Each fix touches only the files named in Phase 36's report; nothing responsive/mobile-specific is in scope (that's Phase 38, which also owns fixing the `resize_window` verification-tool gap).

**Tech Stack:** Next.js App Router (Server Components + `'use client'` islands), TypeScript, Tailwind CSS v4 (`@theme inline` tokens in `src/app/globals.css`), Firestore Admin SDK, Vitest + Firebase emulator for the suite that already exists.

## Global Constraints

- No business logic, capability gating, schema, or data-model changes anywhere in this phase (per the phase brief's exit criteria).
- No responsive/mobile-specific work, and no attempt to fix or replace `resize_window` — flag and stop if either comes up. That's Phase 38.
- This codebase has **zero component-rendering tests** anywhere (confirmed by repo-wide grep — no `@testing-library` usage, no `render()` calls). Existing tests are Vitest **unit** tests (pure functions, e.g. `tests/unit/permissions.test.ts`) and **integration** tests against a real Firestore/Auth emulator (`tests/integration/*.test.ts`, using `tests/setup/fixtures.ts`'s `resetEmulator`/`seedBranch`/etc.). Tasks that add real non-UI logic (a branch-name lookup, a data-cleanup script) get a matching test in one of those two styles. Tasks that are pure JSX/Tailwind changes (POS row styling, popover behavior, banner markup) are verified via `npm run build` + `tsc --noEmit` + live verification against real `erp-lfd` data through the actual running app (browser automation via the `claude-in-chrome` tools, or direct HTTP/manual check if that tool fails to connect, per this project's own recurring note about that). Do not invent component tests this codebase has no precedent for.
- Running `npm test` requires a JRE on `PATH` for the Firestore/Auth emulator, which is **not** on `PATH` in a fresh shell on this machine. Every step that runs `npm test` must first run:
  ```bash
  export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
  ```
- Any step touching real `erp-lfd` production data (Task 6 only) must not delete or modify anything outside the two named test customers and their own directly-referencing docs, and must never delete a `sales`, `treatments`, `appointments`, `labOrders`, or `seminarAttendance` doc — this app's own design deliberately never allows deleting those collections through any route (a sale is voided, never deleted). If Task 6's investigation step finds either test customer referenced by any of those five collections, STOP and report back instead of improvising a deletion path around that invariant.
- Design tokens: `--color-success`/`--color-warning` live in `src/app/globals.css`'s single `@theme inline` block. Any change there is app-wide by construction — Task 5 must positively re-check every existing `text-success`/`bg-success`/`text-warning`/`bg-warning` usage found by grep, not just the three contexts named in the finding.

---

### Task 1: POS out-of-stock/low-stock visibility

**Files:**
- Modify: `src/app/(dashboard)/pos/page.tsx:29-38` (product mapping — add `reorderThreshold`)
- Modify: `src/components/pos/CheckoutForm.tsx` (props type, product search rows, `CartLine` type, cart rows)

**Interfaces:**
- Consumes: `isLowStock(quantity, reorderThreshold): boolean` from `src/lib/inventory/lowStock.ts` (existing, unchanged — the exact shared helper CLAUDE.md already says every low-stock check should use instead of an inline comparison).
- Produces: `CheckoutFormProps.products[].reorderThreshold: number`; `CartLine.availableQuantity?: number` (product lines only — services never carry stock and never backorder).

- [ ] **Step 1: Add `reorderThreshold` to the POS page's product query**

In `src/app/(dashboard)/pos/page.tsx`, the `products` array is built at lines 29-38. Change the mapped object to also read `reorderThreshold` off the same `products` doc (it's already fetched by `productsSnap`, just not read):

```tsx
  const products = productsSnap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name as string,
      sku: data.sku as string,
      price: data.price as number,
      quantity: quantityByProductId.get(d.id) ?? 0,
      reorderThreshold: data.reorderThreshold as number,
    }
  })
```

- [ ] **Step 2: Extend `CheckoutFormProps` and the product search-row styling**

In `src/components/pos/CheckoutForm.tsx`, import the shared helper and widen the prop type:

```tsx
import { isLowStock } from '@/lib/inventory/lowStock'
```

```tsx
export interface CheckoutFormProps {
  products: { id: string; name: string; sku: string; price: number; quantity: number; reorderThreshold: number }[]
  services: { id: string; name: string; price: number }[]
  customers: { id: string; name: string; phone: string }[]
  branchId: string
}
```

Replace the product search-row `<button>` block (currently lines 382-396) with a version that shows a distinct state for zero stock and for low-but-nonzero stock, without touching the service rows below it:

```tsx
          {filteredProducts.map((product) => {
            const outOfStock = product.quantity === 0
            const lowStock = !outOfStock && isLowStock(product.quantity, product.reorderThreshold)
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-mist"
              >
                <span className="min-w-0 truncate text-ink" title={product.name}>
                  {product.name} <span className="text-sm text-slate">({product.sku})</span>
                  {outOfStock && (
                    <span className="ml-2 inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                      Out of stock
                    </span>
                  )}
                  {lowStock && (
                    <span className="ml-2 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                      Low stock
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-sm text-slate text-right">
                  {product.price.toFixed(2)} · qty {product.quantity}
                </span>
              </button>
            )
          })}
```

- [ ] **Step 3: Snapshot available quantity onto the cart line at add-time**

Extend `CartLine` (near the top of the file, alongside the existing interface):

```tsx
interface CartLine {
  type: CartLineType
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  availableQuantity?: number
}
```

Update `addProduct` (currently lines 165-175) to carry the stock snapshot through, on both the create and the existing-line-bump paths:

```tsx
  function addProduct(product: { id: string; name: string; price: number; quantity: number }) {
    setCart((prev) => {
      const idx = prev.findIndex((line) => line.type === 'product' && line.itemId === product.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1, availableQuantity: product.quantity }
        return next
      }
      return [
        ...prev,
        { type: 'product', itemId: product.id, name: product.name, unitPrice: product.price, quantity: 1, availableQuantity: product.quantity },
      ]
    })
  }
```

The two call sites of `addProduct` (the search-row `onClick` in Step 2, and `handleSearchKeyDown`'s `addProduct(filteredProducts[0])`) already pass a full `product` object from `filteredProducts`, which now includes `quantity` — no call-site change needed since `filteredProducts` is derived from the widened `products` prop.

- [ ] **Step 4: Add the Backorder badge to cart rows**

Replace the entire `{cart.map((line, index) => ( ... ))}` block (currently lines 547-596, from the `.map` opening through its matching `))}`) with this version — identical markup throughout except the added `willBackorder` computation, the badge span, and the `.map` callback switching from an implicit-return arrow to an explicit `return (...)` to make room for that computation:

```tsx
            {cart.map((line, index) => {
              const willBackorder =
                line.type === 'product' && line.availableQuantity !== undefined && line.quantity > line.availableQuantity
              return (
                <div key={`${line.type}-${line.itemId}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink" title={line.name}>
                      {line.name}
                      {willBackorder && (
                        <span className="ml-2 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning align-middle">
                          Backorder
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-slate">{line.unitPrice.toFixed(2)} each</p>
                  </div>
                  {line.type === 'product' ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLineQuantity(index, line.quantity - 1)}
                        aria-label={`Decrease quantity of ${line.name}`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-mist text-ink transition-colors duration-200 hover:border-marine hover:bg-mist"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(e) => setLineQuantity(index, Number(e.target.value))}
                        aria-label={`Quantity of ${line.name}`}
                        className="w-14 rounded-lg border border-mist px-2 py-1 text-center font-mono text-ink"
                      />
                      <button
                        type="button"
                        onClick={() => setLineQuantity(index, line.quantity + 1)}
                        aria-label={`Increase quantity of ${line.name}`}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-mist text-ink transition-colors duration-200 hover:border-marine hover:bg-mist"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 font-mono text-sm text-slate">qty 1</span>
                  )}
                  <p className="w-20 shrink-0 text-right font-mono text-sm text-ink">{(line.unitPrice * line.quantity).toFixed(2)}</p>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    aria-label={`Remove ${line.name} from cart`}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-danger transition-colors duration-200 hover:bg-danger/10"
                  >
                    ×
                  </button>
                </div>
              )
            })}
```

- [ ] **Step 5: Build and typecheck**

```bash
npm run build
```
Expected: exits 0, no TypeScript errors in `pos/page.tsx` or `CheckoutForm.tsx`.

- [ ] **Step 6: Live-verify against real `erp-lfd` data**

Using `claude-in-chrome` (or direct HTTP/manual fallback if the browser tool fails to connect — a recurring issue this project has hit before): sign in as a `cashier` or `branch_manager`, open `/pos`, search for a product currently at `quantity: 0` and confirm the "Out of stock" pill renders in the search row; search for one at or below its `reorderThreshold` (but nonzero) and confirm "Low stock"; add the zero-stock item to the cart and confirm the "Backorder" pill appears on its cart line; add a normal in-stock item and confirm no pill appears on either the search row or its cart line.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/pos/page.tsx src/components/pos/CheckoutForm.tsx
git commit -m "fix(pos): distinct visual treatment for zero/low-stock items and backorder cart lines"
```

---

### Task 2: Offline-sync recovery popover — dismissal, positioning, copy

**Files:**
- Modify: `src/components/pos/QueueStatusIndicator.tsx`

**Interfaces:**
- Consumes: nothing new — same `listQueuedSales`/`resolveNeedsAttention` from `@/lib/pos/offlineQueue` and `@/lib/pos/syncQueue`.
- Produces: no exported interface change (default-exported component, same props: none).

- [ ] **Step 1: Make Escape close the panel regardless of focus location**

The current `handlePanelKeyDown` only fires when focus is inside the panel's own DOM subtree, which is why Esc silently did nothing when focus wasn't there. Replace it with a `document`-level listener that's only attached while `open` is true. Add near the top of the component, after the existing `useEffect`:

```tsx
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])
```

Remove the now-redundant `handlePanelKeyDown` function and its `onKeyDown={handlePanelKeyDown}` usage on the panel `<div>` (the new document-level listener supersedes it).

- [ ] **Step 2: Add click-outside-to-close**

Add a ref around the whole trigger+panel wrapper and a `document` `mousedown` listener while open:

```tsx
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])
```

Add `useRef` to the existing `import { useEffect, useState } from 'react'` → `import { useEffect, useRef, useState } from 'react'`. Attach the ref to the outermost returned `<div className="relative">` (line 81): `<div className="relative" ref={containerRef}>`.

- [ ] **Step 3: Reposition so the panel can never overlap page content**

The panel is currently `absolute right-0 mt-2 w-80 ...`, anchored directly under the header trigger button — which sits right above the Checkout page's Customer card, so an open panel covers it. Change it to a viewport-anchored corner panel instead of a button-anchored dropdown, which structurally can't land on top of content in the page body:

```tsx
        <div
          className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto rounded-2xl border border-mist bg-paper p-3 shadow-[var(--shadow-card)]"
        >
```

(replaces the current `className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto rounded-2xl border border-mist bg-paper p-3 shadow-[var(--shadow-card)]"` on the panel div — same classes otherwise, only the positioning changes from `absolute right-0 mt-2` to `fixed bottom-4 right-4`).

- [ ] **Step 4: Fix the copy for the known backorder-without-customer rejection**

`src/app/api/sales/route.ts:213` throws the exact string `'A sale with a backordered item must have a customer attached'` for this case, which `syncQueue.ts` stores verbatim as `lastError`. Add a small mapping just above the component so the panel shows the phase brief's plain-language instruction for that specific, known case, while still showing the raw message for every other rejection reason (out-of-scope root-causing of any other mismatched message some other rejection path might produce — not one of this phase's six fixes):

```tsx
const BACKORDER_NEEDS_CUSTOMER_ERROR = 'A sale with a backordered item must have a customer attached'

function friendlyQueueError(lastError: string | null): string {
  if (lastError === BACKORDER_NEEDS_CUSTOMER_ERROR) {
    return 'This sale needs a customer attached — search or add one below.'
  }
  return lastError ?? 'This sale could not be synced.'
}
```

Replace the `{item.lastError}` render (inside the `item.status === 'needs_attention'` block) with `{friendlyQueueError(item.lastError)}`.

Also remove the now-inaccurate `<p className="mb-1 text-xs text-slate">Press Esc to close.</p>` line — Esc now genuinely closes the panel (Step 1), but tying the hint to one specific key when click-outside also works (Step 2) is no longer the most useful copy; drop the line entirely rather than leave stale/narrow instructional text.

- [ ] **Step 5: Build and typecheck**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 6: Live-verify against real `erp-lfd` data**

As `cashier`, go offline (or use the existing dev pattern for forcing a queued sale), queue a walk-in sale with a line item whose stock is insufficient and no customer attached, let it sync and land in `needs_attention`. Confirm: the panel shows "This sale needs a customer attached — search or add one below."; pressing Esc with focus anywhere on the page closes the panel; clicking anywhere outside the panel closes it; the panel visually sits in the bottom-right corner and never covers the Customer card.

- [ ] **Step 7: Commit**

```bash
git add src/components/pos/QueueStatusIndicator.tsx
git commit -m "fix(pos): offline-sync popover now dismisses via Esc/click-outside, repositioned, and shows plain-language copy"
```

---

### Task 3: Dashboard branch-name resolution

**Files:**
- Create: `src/lib/branches/getBranchName.ts`
- Test: `tests/integration/getBranchName.test.ts`
- Modify: `src/app/(dashboard)/dashboard/page.tsx:22-51`

**Interfaces:**
- Produces: `getBranchName(branchId: string): Promise<string>` — single-doc lookup mirroring the exact pattern `src/lib/dashboard/pendingDeliveriesSummary.ts:35-45` already uses (`db.collection('branches').doc(id).get()`, falling back to the raw id if the doc is missing), not the bulk-collection-scan pattern `lowStockSummary.ts` uses — this is a single, known id, so the per-doc lookup is the right-sized version of "the same lookup."

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/getBranchName.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch } from '../setup/fixtures'
import { getBranchName } from '@/lib/branches/getBranchName'

describe('getBranchName', () => {
  let branchId: string

  beforeAll(async () => {
    await resetEmulator()
    const branch = await seedBranch('LFD Services — Downtown Branch')
    branchId = branch.id
  })

  it('resolves a real branch id to its name', async () => {
    expect(await getBranchName(branchId)).toBe('LFD Services — Downtown Branch')
  })

  it('falls back to the raw id when the branch does not exist', async () => {
    expect(await getBranchName('does-not-exist')).toBe('does-not-exist')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
npm test -- getBranchName
```
Expected: FAIL — `Cannot find module '@/lib/branches/getBranchName'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/branches/getBranchName.ts
import { getAdminFirestore } from '@/lib/firebase/admin'

export async function getBranchName(branchId: string): Promise<string> {
  const db = getAdminFirestore()
  const doc = await db.collection('branches').doc(branchId).get()
  return (doc.data()?.name as string | undefined) ?? branchId
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- getBranchName
```
Expected: PASS, 2/2.

- [ ] **Step 5: Wire it into the Dashboard header**

In `src/app/(dashboard)/dashboard/page.tsx`, import it:

```tsx
import { getBranchName } from '@/lib/branches/getBranchName'
```

Add it to the existing `Promise.all` (lines 34-42), and use the resolved name in the header (lines 46-52):

```tsx
  const [revenueTrend, lowStock, deliveries, activity, appointments, labOrders, leaveApprovals, branchName] = await Promise.all([
    canViewRevenue ? buildRevenueTrend(user) : Promise.resolve(null),
    canViewLowStock ? getDashboardLowStock(user) : Promise.resolve(null),
    canViewDeliveries ? getDashboardPendingDeliveries(user) : Promise.resolve(null),
    canViewActivity ? getRecentActivity(user) : Promise.resolve(null),
    canViewAppointments ? getAppointments({ upcomingOnly: true }, user) : Promise.resolve(null),
    canViewLabOrders ? getPendingLabOrders(user) : Promise.resolve(null),
    canViewLeaveApprovals ? getPendingLeaveApprovals(user) : Promise.resolve(null),
    getBranchName(user.branchId),
  ])
```

```tsx
      <div>
        <h1 className="text-xl font-semibold text-ink">Welcome, {user.email}</h1>
        <p className="text-sm text-slate">
          Role: <span className="font-medium text-ink">{user.role}</span> &middot; Branch:{' '}
          <span className="font-medium text-ink">{branchName}</span>
        </p>
      </div>
```

- [ ] **Step 6: Build and typecheck**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 7: Live-verify against real `erp-lfd` data**

Sign in as any role and load `/dashboard`; confirm the header shows the real branch name (e.g. "LFD Services — Downtown Branch") instead of a raw Firestore ID, matching what the Low Stock/Pending Deliveries widgets already show for the same branch.

- [ ] **Step 8: Commit**

```bash
git add src/lib/branches/getBranchName.ts tests/integration/getBranchName.test.ts src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "fix(dashboard): resolve the header's own branch display to a name instead of a raw Firestore ID"
```

---

### Task 4: Render the silent permission-denial redirect

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — page-local rendering change only.

- [ ] **Step 1: Read the `error` search param and render a banner**

Every one of this app's ~40 capability-gated pages does `redirect('/dashboard?error=not-authorized')` on an `AuthError`, landing here with the param present but never rendered. Add `searchParams` to `DashboardPage`, following this codebase's existing convention (e.g. `src/app/(dashboard)/appointments/page.tsx:9-11`, `src/app/(dashboard)/reports/sales/page.tsx:9-11` — `searchParams: Promise<{...}>`, awaited inside):

```tsx
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { error } = await searchParams
```

Render a banner right above the existing header block (before the `<div><h1>Welcome...` block), only when the param is present:

```tsx
      {error === 'not-authorized' && (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          You don't have permission to view that page.
        </div>
      )}
```

- [ ] **Step 2: Build and typecheck**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Live-verify against real `erp-lfd` data**

Sign in as a role that correctly lacks a capability (e.g. `hr_admin` visiting `/stock`, per the UAT checklist's own documented case), confirm the redirect to `/dashboard?error=not-authorized` now shows the visible banner instead of landing silently. Confirm a normal `/dashboard` visit (no `error` param) shows no banner.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "fix(dashboard): render the not-authorized redirect's error param as a visible banner"
```

---

### Task 5: WCAG AA contrast fix for `success`/`warning` tokens

**Files:**
- Modify: `src/app/globals.css:11,13`
- Test: `tests/unit/colorContrast.test.ts`

**Interfaces:**
- Produces: `--color-success: #166534` (was `#16a34a`), `--color-warning: #92400e` (was `#d97706`). `--color-danger`/`--color-info` are unchanged and out of scope.

- [ ] **Step 1: Write the failing test**

Computed by hand against this app's actual palette (not just white) for this plan: both new values clear 4.5:1 against `--color-paper` (`#f8fafc`, the app's page background) **and** against their own worst-case real usage — a `/10`-opacity self-tinted badge (`bg-success/10 text-success`, `bg-warning/10 text-warning`), the pattern used by `ProductTable.tsx`, `StaffTable.tsx`, `PendingDeliveriesSection.tsx`, `LabSection.tsx`, and others — which is *lighter* than plain paper and therefore the tightest real case in this app, tighter than plain white. Old `#16a34a`/`#d97706` measure ≈3.15–3.18:1 there; new `#166534`/`#92400e` measure ≈6.1–6.8:1. Encode this as a real, reusable contrast check rather than a one-off manual note, so a future token change can't silently regress below AA again:

```ts
// tests/unit/colorContrast.test.ts
import { describe, it, expect } from 'vitest'

function srgbToLinear(c: number): number {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

// 10%-opacity flat blend of `fg` over `bg` — matches Tailwind's `/10` badge
// idiom (e.g. `bg-success/10`), this app's tightest real success/warning
// text background, lighter than the app's own paper background.
function blend(fg: string, bg: string, alpha: number): string {
  const fgR = parseInt(fg.slice(1, 3), 16)
  const fgG = parseInt(fg.slice(3, 5), 16)
  const fgB = parseInt(fg.slice(5, 7), 16)
  const bgR = parseInt(bg.slice(1, 3), 16)
  const bgG = parseInt(bg.slice(3, 5), 16)
  const bgB = parseInt(bg.slice(5, 7), 16)
  const mix = (f: number, b: number) => Math.round(b * (1 - alpha) + f * alpha)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(fgR, bgR))}${toHex(mix(fgG, bgG))}${toHex(mix(fgB, bgB))}`
}

const PAPER = '#f8fafc'
const WHITE = '#ffffff'
const SUCCESS = '#166534'
const WARNING = '#92400e'

describe('success/warning token contrast (WCAG AA, 4.5:1)', () => {
  it('success text passes against the app paper background', () => {
    expect(contrastRatio(SUCCESS, PAPER)).toBeGreaterThanOrEqual(4.5)
  })
  it('success text passes against its own /10 badge background (tightest real case)', () => {
    expect(contrastRatio(SUCCESS, blend(SUCCESS, WHITE, 0.1))).toBeGreaterThanOrEqual(4.5)
  })
  it('warning text passes against the app paper background', () => {
    expect(contrastRatio(WARNING, PAPER)).toBeGreaterThanOrEqual(4.5)
  })
  it('warning text passes against its own /10 badge background (tightest real case)', () => {
    expect(contrastRatio(WARNING, blend(WARNING, WHITE, 0.1))).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
npm test -- colorContrast
```
Expected: FAIL — the constants in the test currently describe the *target* values, but nothing in the app enforces them yet; this test is really validating the arithmetic/target values ahead of the CSS change, so it should already PASS once the file is added (the assertions are against the hardcoded target hexes, not against `globals.css` itself — there's no CSS-reading step here since this is a design-token file, not a JS-importable value). Run it once to confirm the four assertions are true as written before touching `globals.css` — this is the "prove the target values are correct" step, not a red/green cycle against app code.

- [ ] **Step 3: Update the tokens**

In `src/app/globals.css`:

```css
  --color-success: #166534;
```
(replaces line 11, `--color-success: #16a34a;`)

```css
  --color-warning: #92400e;
```
(replaces line 13, `--color-warning: #d97706;`)

- [ ] **Step 4: Run the full test suite and the color test together**

```bash
npm test
```
Expected: all existing tests still pass (this change touches no application logic, only a CSS custom property value) plus the new 4 contrast assertions.

- [ ] **Step 5: Build**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 6: Live-verify across the three named real contexts, plus a spot-check of the badge pattern generally**

Using `claude-in-chrome` against real `erp-lfd` data (or manual fallback): confirm Dashboard's pending-deliveries count, Checkout's "Balance due"/"Change due" total, and Products' "active" status badge all now render in the new, darker green/amber and read clearly against their backgrounds. Spot-check at least one more `bg-success/10`/`bg-warning/10` badge elsewhere (e.g. Staff or Departments' active badge, or `pos/sales/[id]`'s pending/fulfilled badge) to confirm the token change propagated correctly everywhere it's used, per this task's "verify it doesn't regress anything else currently using those two color variables" requirement.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css tests/unit/colorContrast.test.ts
git commit -m "fix(design): darken success/warning tokens to pass WCAG AA 4.5:1 against real usage contexts"
```

---

### Task 6: Remove leftover QA test customers from the live checkout picker

**Files:**
- Create: `scripts/phase37-cleanup-test-customers.ts` (one-off, not part of the app bundle — mirrors `scripts/seed.ts`'s existing convention of standalone Admin-SDK scripts run manually against real `erp-lfd`)

**Interfaces:**
- Consumes: `getAdminFirestore` from `@/lib/firebase/admin`, `writeAuditLog` from `@/lib/audit/log` (exact same helper `DELETE /api/customers/[id]` uses, so this produces an identical `customer_delete` audit entry to a real UI-driven deletion).
- Produces: nothing new exported — one-off operational script, deleted or left in place after use per the user's preference (not part of this task's exit criteria either way).

- [ ] **Step 1: Write the read-only investigation script**

This must run and be inspected *before* anything is deleted — per this project's TD-3 design, `sales`/`treatments`/`appointments`/`labOrders`/`seminarAttendance` can never be deleted through any route, so if either test customer is referenced by one of those five, full removal is not possible without violating that invariant, and this task must stop and report rather than force it. `pendingDeliveries` is the one collection in TD-3's list that legitimately gets cleaned up here, since it exists only to track an owed delivery, not as an immutable record of a rendered sale/treatment.

```ts
// scripts/phase37-cleanup-test-customers.ts
import { getAdminFirestore } from '../src/lib/firebase/admin'
import { writeAuditLog } from '../src/lib/audit/log'

const TARGET_NAMES = ['Lab Test Only Customer', 'Phase 18 Verification Customer']

const REFERENCE_COLLECTIONS = ['sales', 'treatments', 'appointments', 'labOrders', 'seminarAttendance'] as const
const CLEANUP_COLLECTIONS = ['pendingDeliveries'] as const

async function main() {
  const db = getAdminFirestore()

  for (const name of TARGET_NAMES) {
    const custSnap = await db.collection('customers').where('name', '==', name).get()
    if (custSnap.empty) {
      console.log(`[skip] no customer found named "${name}"`)
      continue
    }

    for (const custDoc of custSnap.docs) {
      const id = custDoc.id
      console.log(`\n=== "${name}" (${id}) ===`)

      const blockers: string[] = []
      for (const col of REFERENCE_COLLECTIONS) {
        const refSnap = await db.collection(col).where('customerId', '==', id).limit(1).get()
        if (!refSnap.empty) blockers.push(col)
      }

      if (blockers.length > 0) {
        console.log(`[BLOCKED] referenced by: ${blockers.join(', ')} — this app never allows deleting those collections. STOPPING for this customer; report back for a decision rather than deleting.`)
        continue
      }

      for (const col of CLEANUP_COLLECTIONS) {
        const refSnap = await db.collection(col).where('customerId', '==', id).get()
        for (const doc of refSnap.docs) {
          console.log(`[delete] ${col}/${doc.id}`)
          await doc.ref.delete()
        }
      }

      console.log(`[delete] customers/${id}`)
      await custDoc.ref.delete()
      await writeAuditLog({
        action: 'customer_delete',
        actorUid: null,
        actorEmail: 'phase37-cleanup-script',
        targetUid: id,
        branchId: null,
        details: { reason: 'Phase 37 Fix 6 — leftover QA test customer removed from live checkout picker' },
      })
      console.log(`[done] "${name}" removed`)
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run it against real `erp-lfd`**

This writes to production data (deletes) — the phase brief itself already decided this cleanup should happen ("decided: clean up"), which is the explicit go-ahead this project's own workflow requires before writing to `erp-lfd`; no separate confirmation needed for this specific, pre-approved action, but the investigation output must still be inspected before treating the task as done.

```bash
npx tsx scripts/phase37-cleanup-test-customers.ts
```

Read the console output carefully:
- If both customers print `[done]`, the task is complete — proceed to Step 3.
- If either prints `[BLOCKED]`, **stop this task here** and report exactly what it's referenced by — do not delete a `sales`/`treatments`/`appointments`/`labOrders`/`seminarAttendance` doc to force it through, and do not mark this fix done. Surface it as an open item for the user to decide (e.g. accept the record staying non-deletable and instead exclude it from the checkout picker's query some other way — that would be a new, separate task, not a silent extension of this one).

- [ ] **Step 3: Live-verify the picker is clean**

Using `claude-in-chrome` (or manual fallback) against real `erp-lfd`: open `/pos` as `cashier`, open the customer picker, search "Lab Test" and "Phase 18" — confirm zero matches for either. Confirm a handful of real, non-test customers still appear normally (the script only ever targets the two exact names).

- [ ] **Step 4: Commit**

```bash
git add scripts/phase37-cleanup-test-customers.ts
git commit -m "chore(crm): remove leftover QA test customers from the live checkout picker"
```

---

### Task 7: Completion report

**Files:**
- Create: `docs/superpowers/plans/2026-07-22-phase-37-targeted-fixes-completion.md`
- Modify: `CLAUDE.md` (status line)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Confirm full-suite regression**

```bash
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
npm test
npm run build
```
Expected: both exit 0. Record the test count in the completion report (per this project's own standing lesson: a passing suite and a passing build are two separate claims, state both).

- [ ] **Step 2: Write the completion report**

Cover, per this project's established completion-report format (see `docs/superpowers/plans/2026-07-19-phase-30.1-lab-scan-uploads-completion.md` or `2026-07-21-phase-35-monitoring-backup-foundation-completion.md` for the house style): what was fixed per task, what was independently confirmed (build/test/live-verify results for each of the six), the Task 6 outcome specifically (both customers cleaned, or a blocked/deferred item if the investigation found a real reference), and an explicit statement that no business logic, capability, or schema changed anywhere in this phase — matching the exit criteria.

- [ ] **Step 3: Update CLAUDE.md's status line**

Add one sentence to the end of the `Current status` paragraph (immediately after the Phase 36 sentence added in the prior session) summarizing Phase 37 as done: six fixes shipped and independently verified, referencing the Task 6 outcome specifically since that's the one with a real possible open item.

- [ ] **Step 4: Commit, then tag**

```bash
git add docs/superpowers/plans/2026-07-22-phase-37-targeted-fixes-completion.md CLAUDE.md
git commit -m "docs: Phase 37 targeted fixes completion report, CLAUDE.md status update"
git tag -a phase-37-baseline -m "Phase 37: targeted fixes from Phase 36's assessment"
```
