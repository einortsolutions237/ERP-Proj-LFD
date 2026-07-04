# Phase 11 — Design Rollout: CRM & Core Admin (Extension Plan)

> Presentation-only. No `api/*/route.ts` file changes. No behavior changes to
> customer phone-uniqueness, the org-wide customer/branch/department data
> model, staff's Phase 8 branch-targeting/`isBranchLocked` logic, or the
> `super_admin` create/edit/delete protections.

## Design decisions carried over from Phase 9/10 (no new tokens)

- Colors: `ink` / `paper` / `marine` / `brass` / `mist` / `slate` /
  `success` / `danger` from `src/app/globals.css`. `tender-orange` stays
  scoped to POS only.
- Type: `font-display` for headings/section labels, default `font-sans`
  body, `font-mono` (global `tabular-nums`) for numeric columns — none of
  this batch's four entities has more than one numeric-ish column (none,
  actually — see below), so `font-mono` sees less use here than in Phase 10.
- Inputs/buttons/errors reuse the exact classes from `CheckoutForm.tsx` /
  Phase 10: input = `rounded-md border border-mist bg-paper px-3 py-2
  text-ink placeholder:text-slate focus:border-marine`; primary button =
  `rounded-md bg-marine px-3 py-2 text-paper transition-opacity
  disabled:opacity-50`; error text = `text-sm text-danger`; secondary/link
  action = `text-marine underline-offset-2 hover:underline`; destructive
  link action = `text-danger underline-offset-2 hover:underline
  disabled:text-slate disabled:no-underline`.
- Table/pill/page-`<h1>` pattern from Phase 10 (`ProductTable.tsx`,
  `products/page.tsx`) reused as-is: `rounded-md border border-mist`
  wrapper, `bg-mist/40` header row, `divide-y divide-mist` rows,
  `hover:bg-mist/40` row hover, `success`/`slate` pill for active/inactive,
  `font-display text-2xl font-semibold text-ink` for `<h1>`.
- No new shared component library (`src/components/ui/` still doesn't
  exist).

## New patterns this batch establishes (flagging, not silently deciding)

1. **Read-only detail page with key-value rows.** Every Phase 10 entity's
   `[id]/page.tsx` was actually an edit form (no separate read-only detail
   view). `customers/[id]/page.tsx` is the first genuine detail page — it
   shows name/phone/email/address/notes as static key-value rows, then a
   purchase-history table, with Edit/Delete as page-level actions rather
   than table-row actions. Proposed pattern: label
   `text-sm text-slate`, value `text-sm text-ink`, rows in a `space-y-1`
   stack — matching the existing label/value color split used everywhere
   else, just without an input.
2. **Fieldset/legend grouping.** `StaffForm.tsx`'s "Emergency contact" is
   the first `<fieldset>` in any restyled form. Proposed:
   `rounded-md border border-mist p-3 space-y-2`, legend
   `text-sm font-medium text-ink px-1` — a direct token-substitution of the
   current `border rounded p-3` / `text-sm font-medium px-1`, nothing
   structurally new.
3. **One-off inline reveal card.** `StaffForm.tsx`'s post-create
   temp-password screen (`<code>` block + "Done" button) has no Phase 9/10
   precedent. Proposed: swap `bg-gray-100` for `bg-mist/40`, keep the
   `<code>` block's monospace nature via `font-mono`, primary button same
   marine classes as everywhere else. Low risk — it's shown once, has no
   interactive state beyond a single button.

## Pre-existing behavior noted, NOT touched

`stock/page.tsx`'s branch-filtered-read asymmetry was flagged in Phase 10
(reads `productStock` filtered to `user.branchId` regardless of role,
unlike the org-wide-fixed `api/stock/route.ts`). Research for this phase
found **the same asymmetry in two more places**, not previously flagged:

- `staff/page.tsx:16` — `where('branchId', '==', user.branchId)` against
  Firestore directly, unconditionally, regardless of role. `GET
  /api/staff` (the route file) was fixed in Phase 8 to be unfiltered for
  org-wide roles via `isBranchLocked()` — this page doesn't call that
  route, it queries Firestore itself and never picked up the fix.
- `departments/page.tsx:16` — same shape: unconditional
  `where('branchId', '==', user.branchId)`, while `GET /api/departments`
  correctly branches on `isBranchLocked()`.

This is now a 3-for-3 pattern (stock, staff, departments) of list pages
built as direct Firestore reads that quietly never inherited their
sibling API route's Phase 8 org-wide fix. Consistent with how Phase 10
handled the stock instance: **noted, not fixed** — this is a design-only
phase and fixing read-scoping is a behavior change, not a restyle. All
three will be called out together in the completion report rather than
letting the newly-found two blend in as if already known.

## Staff branch-targeting UI — flagging per your instruction, not guessing

`POST /api/staff` (Phase 8) accepts an explicit `branchId` in the request
body for non-branch-locked roles, validated against a real `branches`
doc, defaulting to `user.branchId` when omitted. **`StaffForm.tsx` has no
`branchId` field at all** — in `create` mode it never includes `branchId`
in its payload, so every staff member created through this form today
lands in the creating admin's own branch regardless of who's creating
them. The backend capability from Phase 8 has never been wired into any
UI.

This means there's no existing branch-targeting *widget* to restyle —
the thing to decide is whether this phase adds one. I'd recommend **no**:
adding a branch picker would be new functionality gated behind a product
decision (which roles should see it, how it's labeled, whether it
defaults to "current branch" or forces a choice), not a visual restyle of
existing behavior — and it cuts against this phase's explicit
"behave identically to before" exit criterion. Proposed treatment: restyle
`StaffForm.tsx`'s existing fields only, leave the `branchId` gap exactly
as it is today, and record it in the completion report the same way the
three read-scoping asymmetries are recorded — flagged, not fixed,
available for a future phase to pick up as a real feature decision.

**This is the one judgment call in this plan I want an explicit go/no-go
on before implementation starts**, since it's exactly the kind of thing
you asked me to stop and describe rather than force.

## Files — Customers (first task: establishes the detail-page pattern)

1. `src/components/customers/CustomerTable.tsx` — Structural: table
   restyle per the Phase 10 pattern (no status/numeric column — this
   table is Name/Phone/Email/View only, closest in shape to Suppliers'
   "no status, no numeric" case). Identical: client-side name/phone
   search-filter state, `Link` to `/customers/:id`.
2. `src/components/customers/CustomerForm.tsx` — Structural: input/label/
   button restyle. Identical: field set (name/phone/email/address/notes),
   POST/PATCH to `/api/customers`, null-coalescing on optional fields.
3. `src/components/customers/DeleteCustomerButton.tsx` — Structural:
   destructive-link + inline error restyle matching the danger-link class
   above. Identical: `confirm()` dialog, `DELETE /api/customers/:id`,
   surfacing a 409 delete-guard message verbatim via the existing `error`
   state (same discipline as Suppliers' delete-guard in Phase 10).
4. `src/app/(dashboard)/customers/page.tsx` — Structural: header/button
   restyle. Identical: `requireCapability('crm.customer.view')` gate,
   unfiltered org-wide Firestore read, `canCreate` capability check.
5. `src/app/(dashboard)/customers/new/page.tsx` — Structural: wrapper/
   header restyle. Identical: `requireCapability('crm.customer.create')`
   gate (cashier-reachable — comment noting this stays).
6. `src/app/(dashboard)/customers/[id]/page.tsx` — Structural: apply the
   new key-value detail pattern (#1 above) plus restyle the purchase-
   history table with the Phase 10 table pattern. Identical: branch-scoped
   sales query (`where('customerId', ...).where('branchId',
   '==', user.branchId)` — no cross-branch exception, unchanged), 404
   handling, field-by-field `PurchaseRow` construction (never spread, to
   keep the no-raw-Timestamp discipline), `canManage` capability check.
7. `src/app/(dashboard)/customers/[id]/edit/page.tsx` — Structural:
   wrapper/header restyle. Identical: `requireCapability
   ('crm.customer.manage')` gate, fetch-by-id, `initial` construction.

## Files — Staff (highest-risk task: touches Phase 8 branch-targeting adjacency, `super_admin` protections, temp-password reveal)

8. `src/components/staff/StaffForm.tsx` — Structural: input/select/
   fieldset/button restyle, including the new fieldset pattern (#2) and
   reveal-card pattern (#3). Identical: full field set and payload shape
   exactly as today (see "Staff branch-targeting UI" above — no `branchId`
   field added), `isSuperAdminTarget` disabled-input treatment for role
   and employment-status, `mode === 'edit'`-gated employment-status
   select, POST/PATCH to `/api/staff` / `/api/staff/:staffId`,
   `tempPassword` reveal branch.
9. `src/components/staff/StaffTable.tsx` — Structural: table restyle
   (Name/Email/Role/Department/Status/actions — closest in shape to
   Departments, plus two extra columns). Identical: `row.role ===
   'super_admin'` guard disabling Delete (both the early `return` in
   `handleDelete` and the `disabled` prop — both checks stay, this is a
   belt-and-suspenders control, not decoration), `confirm()` dialog,
   `DELETE /api/staff/:id`.
10. `src/app/(dashboard)/staff/page.tsx` — Structural: header/button
    restyle only. Identical: `requireCapability('admin.staff.view')`
    gate, the branch-filtered Firestore read (flagged above as
    out-of-scope, not fixed), `employment` normalization.
11. `src/app/(dashboard)/staff/new/page.tsx` — Structural: wrapper/header
    restyle. Identical: `requireCapability('admin.staff.create')` gate.
12. `src/app/(dashboard)/staff/[staffId]/page.tsx` — Structural: wrapper/
    header restyle. This route is staff's combined detail+edit screen
    (there is no separate read-only staff detail page, unlike Customers).
    Identical: `requireCapability('admin.staff.edit')` gate, the
    branch-mismatch-treated-as-404 privacy check, `toDateInputValue`
    Timestamp normalization, `initial` construction.

## Files — Departments (simple; mirrors Products/Branches shape)

13. `src/components/departments/DepartmentForm.tsx` — Structural: input/
    select/button restyle. Identical: `name`/`active` (edit-only) field
    set, POST/PATCH to `/api/departments`.
14. `src/components/departments/DepartmentTable.tsx` — Structural: table
    restyle (Name/Status/actions — same shape as Branches). Identical:
    `confirm()` dialog, `DELETE /api/departments/:id`.
15. `src/app/(dashboard)/departments/page.tsx` — Structural: header/
    button restyle. Identical: `requireCapability
    ('admin.departments.manage')` gate, the branch-filtered Firestore
    read (flagged above, not fixed).
16. `src/app/(dashboard)/departments/new/page.tsx` — Structural: wrapper/
    header restyle. Identical: same capability gate.
17. `src/app/(dashboard)/departments/[id]/page.tsx` — Structural: wrapper/
    header restyle. This is departments' combined detail+edit screen
    (no separate read-only view, same shape as Staff, unlike Customers).
    Identical: same capability gate, branch-mismatch-as-404 privacy
    check, `initial` construction.

## Files — Branches (simplest; genuinely org-wide, no `branchId` concept to filter)

18. `src/components/branches/BranchForm.tsx` — Structural: input/select/
    button restyle. Identical: `name`/`address`/`phone`/`active`
    (edit-only) field set, POST/PATCH to `/api/branches`.
19. `src/components/branches/BranchTable.tsx` — Structural: table restyle
    (Name/Address/Phone/Status/actions). Identical: `confirm()` dialog,
    `DELETE /api/branches/:id`.
20. `src/app/(dashboard)/branches/page.tsx` — Structural: header/button
    restyle. Identical: `requireCapability('admin.branches.manage')`
    gate, the genuinely-unfiltered (and genuinely correct — a branch
    document IS the branch, nothing to filter) read.
21. `src/app/(dashboard)/branches/new/page.tsx` — Structural: wrapper/
    header restyle. Identical: same capability gate.
22. `src/app/(dashboard)/branches/[id]/page.tsx` — Structural: wrapper/
    header restyle. Combined detail+edit screen, same shape as
    Departments/Staff. Identical: same capability gate, `initial`
    construction (no branch-mismatch check needed — branches aren't
    branch-scoped data, they're the branches themselves).

## Confirmed untouched — protected route files (diffable, not just claimed)

`src/app/api/customers/route.ts`, `src/app/api/customers/[id]/route.ts`,
`src/app/api/staff/route.ts`, `src/app/api/staff/[staffId]/route.ts`,
`src/app/api/departments/route.ts`, `src/app/api/departments/[id]/route.ts`,
`src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`.

## Execution

Per-entity task, subagent-driven-development with review between tasks,
matching Phase 10. Suggested order: **Customers → Departments → Branches
→ Staff** — Customers goes first because it establishes the new
detail-page pattern everything else can crib from if needed (only
Customers actually uses it), and Staff goes last, after three rounds of
pattern-consistency practice, because it carries the most risk (Phase 8
adjacency, `super_admin` protections, temp-password reveal, the
branch-targeting gap called out above).

Review tier matched to risk, per the project's established practice:
- Customers, Departments, Branches: Sonnet task review (same tier as
  Products/Services/Suppliers in Phase 10 — structural restyle of simple
  CRUD, no security-adjacent logic in the diff).
- Staff: **Opus task review** (same tier Stock got in Phase 10) — the
  diff sits next to `isSuperAdminTarget` protections, the branch-mismatch
  privacy check, and the temp-password reveal; the reviewer should
  specifically confirm none of those three moved, not just that the
  visual output looks right.

Final whole-branch review checks for drift between the four
independently-styled tasks (as Phase 10 did) plus re-confirms: all 8
route files above are absent from the full-phase diff; the three
flagged read-scoping asymmetries (stock, staff, departments) are present
and unchanged, not accidentally fixed as a side effect; and the
`branchId`-less `StaffForm` create payload is unchanged.

Completion report written as a real file at
`docs/superpowers/plans/2026-07-04-phase-11-design-crm-core-admin-completion.md`,
matching Phase 10's level of detail: commit table (task/entity/commit/
files/lines), `git diff --stat` confirmation of the untouched route list,
cross-task consistency notes, and a per-screen self-critique — with
Staff's entry getting the most words, covering the branch-targeting gap
decision specifically, per your instruction.
