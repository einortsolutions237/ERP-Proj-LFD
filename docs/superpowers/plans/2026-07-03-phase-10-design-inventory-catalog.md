# Phase 10 — Design Rollout: Inventory & Catalog (Extension Plan)

> Presentation-only. No `api/*/route.ts` file changes. No behavior changes to
> SKU uniqueness, the supplier delete-guard, stock movement/transfer
> transaction logic, or Phase 8 branch-targeting.

## Design decisions carried over from Phase 9 (no new tokens)

- Colors: `ink` / `paper` / `marine` / `brass` / `mist` / `slate` /
  `success` / `danger` from `src/app/globals.css`. No `tender-orange` use
  here (that stays scoped to the POS payment chips).
- Type: `font-display` for headings/section labels, default `font-sans` body,
  `font-mono` (with the global `tabular-nums` rule) for numeric columns —
  price, cost, quantity, threshold, duration.
- Inputs/buttons/errors reuse the exact classes already established in
  `CheckoutForm.tsx`: input = `rounded-md border border-mist bg-paper px-3
  py-2 text-ink placeholder:text-slate focus:border-marine`; primary button =
  `rounded-md bg-marine px-3 py-2 text-paper transition-opacity
  disabled:opacity-50`; error text = `text-sm text-danger`.
- No new shared component library introduced (`src/components/ui/` does not
  exist today and Phase 9 didn't create one) — classes are applied inline
  per file, consistent with the existing pattern.

## New pattern this phase establishes (flagging, not silently deciding)

Phase 9 never styled a data table (POS has no table, only cart rows). This
phase's tables are the first. Proposed pattern: `rounded-md border
border-mist`, `divide-y divide-mist` rows, header row `text-xs
font-medium uppercase tracking-wide text-slate`, row hover
`hover:bg-mist/40`, status/low-stock as a small pill (`success`/`slate` for
active/inactive, `danger` for low stock), numeric cells `font-mono`. Mobile
handling reuses the existing global `overflow-x-auto` on `<main>` in
`NavShell.tsx` — no per-table stacked-card mobile variant is planned (would
be a new abstraction beyond what Phase 9 established). Flagging this choice
explicitly rather than assuming it's fine.

Page-level `<h1>` also hasn't been styled before (Phase 9 only touched the
shell chrome and POS, which has no page title). Proposed:
`font-display text-2xl font-semibold text-ink`.

## Pre-existing behavior noted, NOT touched

`src/app/(dashboard)/stock/page.tsx` reads `productStock` filtered to
`user.branchId` unconditionally, regardless of role — unlike
`api/stock/route.ts`, which Phase 8 fixed to be unfiltered for org-wide
roles. This page apparently never calls that route; it queries Firestore
directly. This is a pre-existing asymmetry, out of scope for a design-only
phase — flagged for awareness, not fixed here.

## Files — Products

1. `src/components/products/ProductTable.tsx` — Structural: table wrapper/row/badge classes per the pattern above. Identical: columns, delete-confirm dialog, `deletingId`/`error` state, the `DELETE /api/products/:id` call.
2. `src/components/products/ProductForm.tsx` — Structural: input/label/select/button classes only. Identical: field set/order, `unitCost`/`price`/`reorderThreshold`/`supplierId`/`active` handling, POST/PATCH to `/api/products`.
3. `src/app/(dashboard)/products/page.tsx` — Structural: header + "Add product" button classes. Identical: `requireCapability('inventory.catalog.manage')` gate, unfiltered org-wide Firestore read, row mapping.
4. `src/app/(dashboard)/products/[id]/page.tsx` — Structural: wrapper/header classes only. Identical: fetch-by-id, 404 handling, suppliers list fetch, `initial` prop construction.
5. `src/app/(dashboard)/products/new/page.tsx` — Structural: wrapper/header classes only. Identical: suppliers fetch, capability gate.

## Files — Services (mirrors Products)

6. `src/components/services/ServiceTable.tsx` — Structural: table restyle. Identical: columns, delete flow, `DELETE /api/services/:id`.
7. `src/components/services/ServiceForm.tsx` — Structural: input restyle. Identical: field set, POST/PATCH to `/api/services`.
8. `src/app/(dashboard)/services/page.tsx` — Structural: header/button restyle. Identical: capability gate, unfiltered read.
9. `src/app/(dashboard)/services/[id]/page.tsx` — Structural: wrapper/header restyle. Identical: fetch-by-id, 404, `initial` construction.
10. `src/app/(dashboard)/services/new/page.tsx` — Structural: wrapper/header restyle. Identical: capability gate.

## Files — Suppliers (mirrors Products; no `suppliers` prop dependency)

11. `src/components/suppliers/SupplierTable.tsx` — Structural: table restyle. Identical: `contact.phone`/`contact.email` display fallback (`—`), delete flow including surfacing the delete-guard error message verbatim via the existing generic `error` paragraph.
12. `src/components/suppliers/SupplierForm.tsx` — Structural: input restyle. Identical: `contact.{phone,email,address}`/`notes` null-coalescing, POST/PATCH to `/api/suppliers`.
13. `src/app/(dashboard)/suppliers/page.tsx` — Structural: header/button restyle. Identical: capability gate, unfiltered read.
14. `src/app/(dashboard)/suppliers/[id]/page.tsx` — Structural: wrapper/header restyle. Identical: fetch-by-id, 404, `initial` construction.
15. `src/app/(dashboard)/suppliers/new/page.tsx` — Structural: wrapper/header restyle. Identical: capability gate.

## Files — Stock (different shape: branch-scoped, no `/new` or `/[id]` route, inline expandable forms)

16. `src/components/stock/StockTable.tsx` — Structural: table restyle, low-stock pill (`danger`), Adjust/Transfer trigger buttons restyled as `border-mist text-ink hover:bg-mist` buttons, expanded-row background restyled from `bg-zinc-50` to a token-based tint (`bg-mist/30`). Identical: `openForm` toggle state, conditional `canAdjust`/`canTransfer` column rendering, which form renders inline.
17. `src/components/stock/StockAdjustForm.tsx` — Structural: input/select/button restyle. Identical: `type`/`direction`/`magnitude` parsing, `quantityDelta` sign logic, POST to `/api/stock/movements`.
18. `src/components/stock/StockTransferForm.tsx` — Structural: input/select/button restyle. Identical: `destBranchId`/`quantity` validation, POST to `/api/stock/transfer`.
19. `src/app/(dashboard)/stock/page.tsx` — Structural: wrapper/header restyle only. Identical: the branch-filtered read noted above (untouched, not a fix), `canAdjust`/`canTransfer` capability derivation.

## Confirmed untouched — protected route files (diffable, not just claimed)

`src/app/api/products/route.ts`, `src/app/api/products/[id]/route.ts`,
`src/app/api/services/route.ts`, `src/app/api/services/[id]/route.ts`,
`src/app/api/suppliers/route.ts`, `src/app/api/suppliers/[id]/route.ts`,
`src/app/api/stock/route.ts`, `src/app/api/stock/movements/route.ts`,
`src/app/api/stock/transfer/route.ts`.

## Execution

Per-entity task (products / services / suppliers / stock = 4 tasks),
subagent-driven-development with review between tasks, matching this
project's established phase workflow. Completion report written as a real
file at `docs/superpowers/plans/2026-07-03-phase-10-design-inventory-catalog-completion.md`
covering: files changed and rough diff size, explicit confirmation (via
`git diff --stat` against the route list above) that no route file was
touched, and a one-line self-critique per screen on whether it reads as
intentional for this app vs. generic.
