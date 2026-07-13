# Phase 22 — Structural Design Polish (Catalog, Inventory, CRM & Core Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Phase 21's structural conventions (large-radius soft-shadow cards, tightened-then-reopened spacing, `duration-200` transitions, monospace/right-aligned numeric cells) to the eight entity types Phases 10 and 11 originally styled — products, services, suppliers, stock, customers, staff, departments, branches. Colors and typography already cascaded correctly in Phase 21 (confirmed by investigation below); this phase touches structure only.

**Architecture:** One task per entity type (mirroring Phase 10's own task shape), each restyling that entity's list/form/(detail) files against a single shared mapping table defined once below — not eight separate ad hoc mappings. Stock gets the higher-scrutiny review tier (Opus), matching Phase 10's own risk-tiering for the same files. A final whole-branch task checks for drift between the eight entities' styling, the same cross-task consistency check Phase 10 ran.

**Tech Stack:** Tailwind CSS v4, tokens/utilities already established in `globals.css` by Phase 21 (`--color-surface`, `--shadow-card`, etc.) — this phase adds no new tokens.

## Global Constraints

- **Zero color or font value changes anywhere in this phase's diff.** Every `text-*`/`bg-*`/`border-*` color utility and every `font-*` utility already resolves correctly via Phase 21's `globals.css` cascade — confirmed by investigation below. If a task's diff contains any color/font utility change, that's a spec violation, not a stylistic choice.
- **Zero behavior changes.** SKU uniqueness, the supplier delete-guard, stock transaction logic (`/api/stock/movements`, `/api/stock/transfer`), the Phase 8 branch-targeting fix, the Phase 12 read-scoping fix (`isBranchLocked` on staff/departments/stock reads), and every TD-3 referential-integrity delete-guard must behave identically to before. Every task's diff should show only `className` changes — no JS logic, no JSX structural/conditional changes, no new state, no new props.
- **Scope is exactly:** the list/form/(detail) files for products, services, suppliers, stock, customers, staff, departments, branches (enumerated per task below — 41 files total). No other screen (roles, settings, HR, reports, the clinical module, messaging, seminars, POS/shell — already done in Phase 21) gets touched.
- Responsive to mobile/tablet width, visible `:focus-visible` keyboard focus (unchanged token, should just work), motion restrained and respecting `prefers-reduced-motion` (already global, no code change needed).

---

## Investigation (done before this plan, not assumed)

A repo-wide scan of all 41 in-scope files found:
- **76 instances of `rounded-md`, 0 instances of any `shadow-*` utility, 0 instances of any `duration-*` utility** — confirming these files are still on Phase 9/10/11's original structural conventions, exactly the state Phase 21 found the shell/POS in before its own restyle.
- **`font-mono` already applied to some numeric fields** (prices in `ProductForm.tsx`/`ProductTable.tsx`/`ServiceForm.tsx`/`ServiceTable.tsx`, quantities in the stock files, an ID-like field in `StaffForm.tsx`) — Phase 10/11 already got the "monospace for technical values" convention right in places; this phase's job on numeric cells is adding `text-right` for uniformity and applying `font-mono` to any numeric cell that's missing it, not introducing the convention from scratch.
- **Badges already use `rounded-full` pill shapes** (12 instances, e.g. `ProductTable.tsx`'s active/inactive status pill) — already matches the new component guidance, no change needed.
- **Every "card" section is a `rounded-md border border-mist` container** (`bg-paper` or `bg-mist/40`-tinted) — direct structural analog of what Phase 21 changed to `rounded-2xl` + `shadow-[var(--shadow-card)]` + `bg-surface` in `CheckoutForm.tsx`. Same mapping applies here.
- **Zero `sticky` usage anywhere in these files.** Table headers are a candidate for `sticky` per the brief's "where it fits" — see the note on this below, applied as an explicit per-task judgment call, not a blanket requirement, given the added complexity of computing the correct top-offset against `NavShell.tsx`'s own sticky header (~56px tall: `py-3.5` + border + text content) without risking a z-index/overlap conflict.

## Shared mapping table (applies to every task below — read once, apply consistently per file)

| Pattern | Before | After |
|---|---|---|
| Card/section container (list-table wrapper, form section groupings) | `rounded-md border border-mist` (+ `bg-paper` or bare) | `rounded-2xl border border-mist shadow-[var(--shadow-card)] bg-surface` |
| Tinted sub-container that's deliberately NOT a card (e.g. a totals/summary strip using `bg-mist/40`) | `rounded-md ... bg-mist/40` | keep `bg-mist/40`, only update the radius to `rounded-lg` (do not force `bg-surface`/shadow onto an intentionally-tinted strip — same judgment Phase 21 applied to `CheckoutForm.tsx`'s totals panel) |
| Buttons (primary/secondary/danger) | `rounded-md ...` | `rounded-lg ...`, add `duration-200` to whatever `transition-*` class is present (`transition-colors`, `transition-opacity`, etc. — don't force a specific transition property, just add the duration to the one that's there) |
| Inputs/selects/textareas | `rounded-md border border-mist bg-paper px-3 py-2 ...` | `rounded-lg border border-mist bg-paper px-3 py-2 ...` (radius only — inputs stay on the page background, not `bg-surface`, matching Phase 21's `CheckoutForm.tsx` inputs) |
| Table wrapper | `overflow-hidden rounded-md border border-mist` | `overflow-hidden rounded-2xl border border-mist shadow-[var(--shadow-card)] bg-surface` |
| Table header row | `bg-mist/40` (no radius/shadow concern here — header row, not a card) | unchanged, UNLESS this task's implementer judges a sticky header genuinely helps this specific table (see note below) |
| Table row hover | `hover:bg-mist/40 transition-colors` | `hover:bg-mist/40 transition-colors duration-200` |
| Numeric table cells (price, quantity, SKU-adjacent counts — NOT plain text like name/category/status) | inconsistent `font-mono`/no `text-right`, or missing `font-mono` entirely | `font-mono text-right` added/completed uniformly on every genuinely-numeric cell in that table |
| Badges/pills | `rounded-full ...` | unchanged — already correct |
| Links (Edit/Delete-style text links) | `text-marine underline-offset-2 hover:underline` / `text-danger ...` | unchanged — these are text links, not buttons; no radius/shadow concept applies |
| Form field spacing | `space-y-3` between fields | leave as-is unless the file's own vertical rhythm is visibly cramped relative to the new card padding — this is a minor judgment call, not a forced global bump (Phase 21's shell/POS spacing bump was `gap`/`py` on nav items and header, not blanket `space-y-*` — don't over-apply here) |

**Sticky table headers — explicit judgment call, not a requirement.** If a task's table is likely to have enough rows to benefit (products, customers, staff are the more plausible candidates; departments/branches/suppliers are typically short lists), the implementer MAY add `sticky top-14 z-10` to the `<thead>`'s `<tr>` (top offset `top-14`/56px clears `NavShell.tsx`'s own `sticky top-0 z-30` header without overlapping it — confirm this visually if browser access is available, or reason about it carefully from both files' actual heights if not). If uncertain whether it's worth the added risk for a given table, skip it and say so in the report — this is optional polish, not an exit criterion.

---

## Task 1: Products

**Files:**
- Modify: `src/app/(dashboard)/products/page.tsx`, `src/app/(dashboard)/products/new/page.tsx`, `src/app/(dashboard)/products/[id]/page.tsx`
- Modify: `src/components/products/ProductForm.tsx`, `src/components/products/ProductTable.tsx`

**Interfaces:** No prop/type changes — pure restyle per the shared mapping table above. `ProductTable`'s `handleDelete` (calls `DELETE /api/products/[id]`, the SKU-uniqueness-adjacent delete path) must remain byte-identical.

- [ ] Read all 5 files in full, apply the shared mapping table consistently.
- [ ] Run `npx tsc --noEmit` and `npm run dev` (build-health check).
- [ ] Confirm via `git diff` that every changed line is a className string (no logic/handler/state changes) — `handleDelete`, `useState`, `useRouter`, and any price/SKU computation must be untouched.
- [ ] Commit: `git add src/app/"(dashboard)"/products src/components/products && git commit -m "style(products): apply Phase 21 structural conventions"`

## Task 2: Services

**Files:**
- Modify: `src/app/(dashboard)/services/page.tsx`, `src/app/(dashboard)/services/new/page.tsx`, `src/app/(dashboard)/services/[id]/page.tsx`
- Modify: `src/components/services/ServiceForm.tsx`, `src/components/services/ServiceTable.tsx`

**Interfaces:** No prop/type changes. Same shape as Task 1 — services have no stock/SKU concept per CLAUDE.md ("walk-in, not appointment-based... no stock count behind it"), so there's no delete-guard equivalent to worry about here beyond the standard capability check.

- [ ] Read all 5 files in full, apply the shared mapping table consistently.
- [ ] Run `npx tsc --noEmit` and `npm run dev`.
- [ ] Confirm className-only diff via `git diff`.
- [ ] Commit: `git add src/app/"(dashboard)"/services src/components/services && git commit -m "style(services): apply Phase 21 structural conventions"`

## Task 3: Suppliers

**Files:**
- Modify: `src/app/(dashboard)/suppliers/page.tsx`, `src/app/(dashboard)/suppliers/new/page.tsx`, `src/app/(dashboard)/suppliers/[id]/page.tsx`
- Modify: `src/components/suppliers/SupplierForm.tsx`, `src/components/suppliers/SupplierTable.tsx`

**Interfaces:** No prop/type changes. **Named risk:** `SupplierTable.tsx`'s delete action calls a route with a real delete-guard (suppliers likely can't be deleted while referenced by active products — confirm this guard's error-handling JSX, e.g. an inline error message on a blocked delete, is preserved exactly, not merely the happy-path delete flow).

- [ ] Read all 5 files in full. Before restyling, specifically locate and note the delete-guard's error-display code path (probably a `setError(body.error)` pattern matching `ProductTable.tsx`'s shape) so you know exactly what NOT to touch.
- [ ] Apply the shared mapping table consistently.
- [ ] Run `npx tsc --noEmit` and `npm run dev`.
- [ ] Confirm className-only diff via `git diff`, with specific attention to the delete-guard code path identified above.
- [ ] Commit: `git add src/app/"(dashboard)"/suppliers src/components/suppliers && git commit -m "style(suppliers): apply Phase 21 structural conventions"`

## Task 4: Stock (higher review tier — transaction-adjacent)

**Files:**
- Modify: `src/app/(dashboard)/stock/page.tsx`
- Modify: `src/components/stock/StockTable.tsx`, `src/components/stock/StockAdjustForm.tsx`, `src/components/stock/StockTransferForm.tsx`

**Interfaces:** No prop/type changes. **This is the highest-risk task in the phase**, matching Phase 10's own risk-tiering for these exact files. `StockAdjustForm.tsx` and `StockTransferForm.tsx` both construct `POST` bodies for `/api/stock/movements`/`/api/stock/transfer` with real quantity-delta math (`quantityDelta` sign flips based on `type`/`direction` in `StockAdjustForm.tsx`; a similar or related computation in `StockTransferForm.tsx`) — this is exactly the class of logic this project's CLAUDE.md calls out as needing transaction-level care. `StockTable.tsx` also carries the Phase 12 fix where each row uses its own `branchId` (not the viewer's ambient one) for the Adjust/Transfer forms and the transfer destination-exclusion logic — confirm this per-row `branchId` threading is completely undisturbed.

- [ ] Read all 4 files in full. Before editing, catalog every stateful/logic-bearing line in `StockAdjustForm.tsx` and `StockTransferForm.tsx` specifically (the same pre-edit-catalog technique Phase 21's Task 3 used for `CheckoutForm.tsx`) — every `useState`, the quantity-delta sign computation, the `fetch` body construction, any validation. Write this catalog into your report before making any edit.
- [ ] Apply the shared mapping table consistently across all 4 files.
- [ ] After editing, check the post-edit diff line-by-line against your pre-edit catalog — confirm zero catalog lines appear in the diff.
- [ ] In `StockTable.tsx` specifically, confirm every occurrence of `row.branchId` (as opposed to an ambient/viewer branchId) is untouched — this is the Phase 12 fix, and it's easy to accidentally regress if a className-focused pass isn't careful about which JSX attributes it's near.
- [ ] Run `npx tsc --noEmit` and `npm run dev`.
- [ ] Commit: `git add src/app/"(dashboard)"/stock src/components/stock && git commit -m "style(stock): apply Phase 21 structural conventions, zero behavior change"`

## Task 5: Customers

**Files:**
- Modify: `src/app/(dashboard)/customers/page.tsx`, `src/app/(dashboard)/customers/new/page.tsx`, `src/app/(dashboard)/customers/[id]/page.tsx`, `src/app/(dashboard)/customers/[id]/edit/page.tsx`
- Modify: `src/components/customers/CustomerForm.tsx`, `src/components/customers/CustomerTable.tsx`, `src/components/customers/DeleteCustomerButton.tsx`

**Interfaces:** No prop/type changes. **Named risk:** `DeleteCustomerButton.tsx` is the UI for TD-3's referential-integrity guard (`DELETE /api/customers/[id]` blocks on `sales`/`treatments`/`appointments`/`labOrders`/`seminarAttendance`/`pendingDeliveries`) — its error-display path for a blocked delete must be preserved exactly. **`customers/[id]/page.tsx` is the same file the clinical module (Phases 13-19.2) has touched repeatedly under a strict "do not touch the rest of the file" standard** — this phase's restyle must hold to that same standard: touch only the commercial/CRM sections' styling (the sections this phase actually owns), leave every clinical-gated section (`ClinicalSection`, `LabSection`, `IntakeSection`, seminar-attendance subsection) completely untouched, since those aren't part of this phase's eight entities and have their own established review history.

- [ ] Read all 7 files in full. In `customers/[id]/page.tsx` specifically, identify exactly which JSX blocks are the commercial/CRM sections (contact info, purchase history, notes) versus the clinical-gated sections — restyle only the former.
- [ ] Apply the shared mapping table consistently.
- [ ] Run `npx tsc --noEmit` and `npm run dev`.
- [ ] Confirm className-only diff via `git diff`, with specific confirmation that no clinical-section JSX in `customers/[id]/page.tsx` was touched (diff that file's clinical-related lines against what Phase 19.2's own diff last confirmed, if easily checkable, or at minimum re-read the current clinical sections after your edit and confirm they're identical to before your edit).
- [ ] Commit: `git add src/app/"(dashboard)"/customers src/components/customers && git commit -m "style(customers): apply Phase 21 structural conventions (commercial/CRM sections only)"`

## Task 6: Staff

**Files:**
- Modify: `src/app/(dashboard)/staff/page.tsx`, `src/app/(dashboard)/staff/new/page.tsx`, `src/app/(dashboard)/staff/[staffId]/page.tsx`
- Modify: `src/components/staff/StaffForm.tsx`, `src/components/staff/StaffTable.tsx`

**Interfaces:** No prop/type changes. **Named risk:** `staff/page.tsx` and `StaffTable.tsx` carry the Phase 12 `isBranchLocked()` read-scoping fix (branch-locked roles see only their branch's staff) — confirm this logic (a conditional filter/query shape, not just a className) is completely untouched. `StaffForm.tsx` is the largest file in scope (15 `rounded-md border` occurrences found in investigation) — read it fully before editing, don't skim.

- [ ] Read all 5 files in full. Locate the `isBranchLocked`-related logic in `staff/page.tsx`/`StaffTable.tsx` before editing so you know exactly what to leave alone.
- [ ] Apply the shared mapping table consistently — `StaffForm.tsx` has many card sections, apply the same transformation to each one individually, don't miss any.
- [ ] Run `npx tsc --noEmit` and `npm run dev`.
- [ ] Confirm className-only diff via `git diff`.
- [ ] Commit: `git add src/app/"(dashboard)"/staff src/components/staff && git commit -m "style(staff): apply Phase 21 structural conventions"`

## Task 7: Departments

**Files:**
- Modify: `src/app/(dashboard)/departments/page.tsx`, `src/app/(dashboard)/departments/new/page.tsx`, `src/app/(dashboard)/departments/[id]/page.tsx`
- Modify: `src/components/departments/DepartmentForm.tsx`, `src/components/departments/DepartmentTable.tsx`

**Interfaces:** No prop/type changes. **Named risk:** same Phase 8/12 `isBranchLocked()` read-scoping and branch-targeting-on-create fix as staff/stock — confirm untouched.

- [ ] Read all 5 files in full, apply the shared mapping table consistently.
- [ ] Run `npx tsc --noEmit` and `npm run dev`.
- [ ] Confirm className-only diff via `git diff`, with specific attention to any `isBranchLocked`/branch-targeting logic.
- [ ] Commit: `git add src/app/"(dashboard)"/departments src/components/departments && git commit -m "style(departments): apply Phase 21 structural conventions"`

## Task 8: Branches

**Files:**
- Modify: `src/app/(dashboard)/branches/page.tsx`, `src/app/(dashboard)/branches/new/page.tsx`, `src/app/(dashboard)/branches/[id]/page.tsx`
- Modify: `src/components/branches/BranchForm.tsx`, `src/components/branches/BranchTable.tsx`

**Interfaces:** No prop/type changes. Branches are org-wide (per CLAUDE.md, confirmed correctly needing no branch-scoping fix historically) — lowest-risk task in the phase.

- [ ] Read all 5 files in full, apply the shared mapping table consistently.
- [ ] Run `npx tsc --noEmit` and `npm run dev`.
- [ ] Confirm className-only diff via `git diff`.
- [ ] Commit: `git add src/app/"(dashboard)"/branches src/components/branches && git commit -m "style(branches): apply Phase 21 structural conventions"`

## Task 9: Whole-branch cross-entity consistency pass

**Files:** none created/modified directly — this task is a review/verification pass, matching Phase 10's own "dedicated final review pass checking for drift *between* independently-styled screens."

- [ ] With Tasks 1-8 all complete and reviewed, read across all eight entities' list pages and form pages side by side (or via a diff-of-diffs comparison) and confirm: identical radius (`rounded-2xl` on every card, `rounded-lg` on every button/input, no stray `rounded-md` left anywhere in scope), identical shadow token usage, identical `duration-200` application, identical numeric-cell treatment (`font-mono text-right`), no entity drifted onto a slightly different value than the shared mapping table specifies.
- [ ] Confirm zero `rounded-md` remains anywhere in the 41 in-scope files (a grep-able, objective check: `grep -c rounded-md` across all 41 files should return 0 after Tasks 1-8, down from the investigation's baseline of 76).
- [ ] Confirm zero color or font utility changes across the whole phase's diff (`git diff` across all 8 task commits, scanning specifically for any `text-`/`bg-`/`border-`/`font-` value change — there should be none, since only radius/shadow/spacing/duration utilities were ever touched).
- [ ] If browser access is available by this point, do a live click-through of at least 3 of the 8 entities (pick a mix — one catalog like products, stock specifically given its risk tier, and one admin entity like staff) to visually confirm the cards/tables/buttons read as one coherent system, not 8 independently-drifted ones.

## Task 10: Completion report (+ opportunistic Phase 21 live verification)

**Files:**
- Create: `docs/superpowers/plans/2026-07-12-phase-22-structural-design-polish-completion.md`

- [ ] Run the whole-branch diff summary (`git diff --stat` across all 8 task commits) and confirm exactly 41 files changed, matching this plan's declared scope.
- [ ] If browser access is available: do a live click-through of the shell (Phase 21's still-outstanding walkthrough — sticky sidebar while scrolling, mobile drawer, hover/focus states, sign-out) and one real checkout (add a product and a service, split payment, pick/clear a customer) — this closes out Phase 21's own outstanding verification opportunistically, per this phase's explicit instruction, while also confirming Phase 22's own restyle across at least a few of the 8 entities.
- [ ] Write the completion report: which of the 41 files changed per entity, confirmation of zero color/font changes (the grep-able `rounded-md` count and a scan for any color/font utility diff), confirmation of the stock task's higher review tier and pre-edit-catalog technique, the whole-branch consistency pass's findings, and — plainly, not glossed over — whether live verification happened this session for Phase 22 and/or the still-outstanding Phase 21 walkthrough, or whether both remain code-level-only and outstanding for the user.
- [ ] Commit: `git add docs/superpowers/plans/2026-07-12-phase-22-structural-design-polish-completion.md && git commit -m "docs: Phase 22 completion report — structural design polish"`

---

## Self-Review

**Spec coverage:** All eight entity types, list/form/detail ✓ (Tasks 1-8, 41 files enumerated exactly). Zero color/font changes, confirmed not assumed ✓ (Task 9's grep-able check + explicit diff scan). Behavior preservation for SKU uniqueness/supplier delete-guard/stock transaction logic/Phase 8+12 branch fixes/TD-3 guards ✓ (named per-task risk call-outs: Task 1 SKU-adjacent delete, Task 3 supplier delete-guard, Task 4 stock transaction math + Phase 12 per-row branchId, Task 5 TD-3 delete guard + clinical-section boundary, Tasks 6-7 isBranchLocked). Stock's higher review tier ✓ (Task 4, Opus specified at dispatch time). Whole-branch consistency pass ✓ (Task 9, mirroring Phase 10). Live verification, opportunistic and honest either way ✓ (Task 10). Anything outside the eight entities (clinical/messaging/HR/reports) is explicitly out of scope and not touched by any task.

**Placeholder scan:** No TBD/TODO. The shared mapping table gives the complete transformation pattern once; each task points to it rather than repeating it, which is the same successful shape Phase 21's Tasks 2-3 used ("read the full file, apply the pattern consistently") rather than a placeholder — every task also names its own specific behavior-preservation risk concretely (not "add appropriate care," but the exact fix/guard/computation to watch for).

**Type consistency:** No new props, types, or function signatures anywhere in this plan — every task is a pure restyle. The one shared new-ish pattern (`sticky top-14 z-10` on table headers) is stated once, identically, as an optional judgment call available to every task rather than redefined per task.
