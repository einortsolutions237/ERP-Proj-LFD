# Phase 12 — Branch-Scoping Read Fix — Completion Report

Plan: `docs/superpowers/plans/2026-07-04-phase-12-branch-scoping-read-fix.md`
(sent for review in chat, approved with one explicit fork-point decision —
fix Stock's per-row branchId threading in the same phase rather than
deferring it — then executed via subagent-driven-development: 2 tasks,
one implementer + one Opus task reviewer each, plus one final Opus
whole-branch review.)

> Behavior fix, not presentation — the inverse of Phases 9-11. Zero
> styling/className/JSX-structure changes beyond what the query-logic fix
> strictly required.

## Commits

| Task | Scope | Commit | Files | Lines | Reviewer tier |
|---|---|---|---|---|---|
| 1 | staff/departments/roles read-scoping | `7278a68` | 3 | +15 / -4 | Opus |
| 2 | stock read-scoping + per-row branchId threading | `61b92c3` | 2 | +11 / -11 | Opus |
| **Total** | | | **5** | **+26 / -15** | |

Base: `59f99e8` (`phase-11-baseline` tip). Head: `61b92c3`. Working
directly on `main`, no worktree — matches every prior phase.

## Route files — confirmed untouched (not just claimed)

`git diff --stat 59f99e8..61b92c3 -- src/app/api` returns nothing — zero
lines. Explicitly checked and absent from the full-phase diff, at every
task review and again at the final whole-branch review: `src/app/api/staff/route.ts`,
`src/app/api/departments/route.ts`, `src/app/api/stock/route.ts`,
`src/app/api/stock/movements/route.ts`, `src/app/api/stock/transfer/route.ts`.
This phase brought four *pages* in line with routes that were already
correct since Phase 8 — nothing on the route side needed to change.

## The bug, fixed — and the fourth instance the sweep found

`staff/page.tsx`, `departments/page.tsx`, and `stock/page.tsx` (all
flagged in Phases 10-11) each read their collection directly from
Firestore with a hardcoded, unconditional `.where('branchId', '==',
user.branchId)`, bypassing their sibling API routes' Phase 8
`isBranchLocked()`-based scoping. Before touching code, every `page.tsx`
under `(dashboard)` was grepped for `branchId` and read in context — this
surfaced a **fourth, previously unflagged instance**: `roles/page.tsx`
had the identical anti-pattern against the same `staff` collection,
gated by the same `ADMIN_HR` capability set (`admin.roles.view`), never
caught because no prior phase had touched that file. All four now use
the exact ternary their sibling routes (or, for `roles`, the closest
analogous route — `api/staff/route.ts`, since there is no `api/roles`
route) already established:

```ts
const snap = isBranchLocked(user.role)
  ? await collection.where('branchId', '==', user.branchId).get()
  : await collection.get()
```

## The sweep — full accounting, not just the fixes

Every `page.tsx` under `(dashboard)` was checked. Beyond the four fixed
above:

- **Correctly branch-locked-always by design, not touched:** `pos/page.tsx`
  (checkout stock read — same reasoning as `POST /api/sales` being
  deliberately `user.branchId`-always: a sale happens at one physical
  register regardless of role).
- **Correctly branch-scoped by design, not touched:** `customers/[id]/page.tsx`'s
  purchase-history sales query — a different mechanism (reading a
  branch-scoped collection correctly), not this bug class at all,
  already confirmed correct in the Phase 11 review.
- **Privacy-check 404s, not list-scoping, not touched:** `staff/[staffId]/page.tsx`,
  `departments/[id]/page.tsx`.
- **Genuinely unfiltered, correctly:** `branches/page.tsx` (branches carry
  no `branchId` field of their own).
- **No query-level filtering at all:** `dashboard/page.tsx`, `settings/page.tsx`.
- **Already-aggregated report rows, `branchId` used only as a React `key`, not a filter:** `reports/inventory/page.tsx`, `reports/sales/page.tsx`.
- **Already correctly role-gated, not touched:** `attendance/page.tsx`,
  `leave/review/page.tsx` — both branch on `user.role === 'branch_manager'`
  directly (equivalent to `isBranchLocked()` in practice, since `cashier`
  — the only other branch-locked role — never holds `hr.attendance.view`
  or `hr.leave.approve`). Matches CLAUDE.md's Phase 5 HR section exactly.
- **Found, textually similar, explicitly NOT this bug class — flagged, not fixed:**
  `pos/sales/page.tsx` mirrors `GET /api/sales`'s own unconditional
  branch filter — but that route was never fixed in Phase 8 in the first
  place (verified: no `isBranchLocked()` anywhere in
  `src/app/api/sales/route.ts`). Unlike staff/departments/stock/roles,
  there is no already-decided correct pattern to mirror here; CLAUDE.md
  already carries this forward as an open, undecided question. Fixing
  the page would mean this phase unilaterally deciding that question
  rather than restoring an already-decided one. **Left untouched,
  carried forward unchanged, same as every prior phase.**

## The Stock complication — resolved per your explicit decision

Fixing `stock/page.tsx`'s query alone would have newly exposed a real
bug that was previously masked: `StockTable.tsx` passed one ambient
page-level `branchId` (the viewer's own) to every row's Adjust/Transfer
form, regardless of that row's actual branch. Harmless before this
phase (the buggy query only ever returned the viewer's own branch's
rows); live-reachable the moment `super_admin`/`admin` (who already hold
`inventory.stock.adjust`/`inventory.stock.transfer`) could see
multi-branch rows. You chose "fix both, same phase" — implemented as:

- `StockRow` gained a `branchId` field, populated from each
  `productStock` doc's own `data.branchId`.
- `StockAdjustForm`'s `branchId` prop and `StockTransferForm`'s
  `sourceBranchId` prop now both receive `row.branchId`, not the old
  ambient value.
- The destination-branches exclusion moved from page-level
  (`!== user.branchId`) to per-row at the render site (`!== row.branchId`)
  — confirmed by the final reviewer to be a genuine correctness
  *improvement*, not just an equivalent rewrite: an org-wide admin
  viewing a foreign branch's row can now correctly transfer stock *into*
  their own branch (previously wrongly excluded as a destination).
- The now-unused page-level `branchId` prop was confirmed (by the
  implementer, independently re-confirmed by both the task reviewer and
  the final reviewer) to be fully removable, and removed from
  `StockTableProps`, the destructured params, and the `<StockTable />`
  call site.

## Behavior preservation

Both task reviewers (Opus, given the access-control stakes) traced the
diff against the brief's requirements and confirmed zero unintended
logic drift. The final whole-branch review independently re-verified
end to end:

- The `isBranchLocked` ternary is byte-consistent across all four fixed
  files and matches their sibling routes' existing pattern exactly
  (diffed character-for-character against `api/staff/route.ts` and
  `api/departments/route.ts`).
- `branch_manager`'s restriction is preserved everywhere it must be —
  the branch-locked arm of every ternary is intact and non-inverted.
- Stock's per-row `branchId` threading was hand-traced end to end by
  both the Task 2 reviewer and the final reviewer: `row.branchId` (from
  the doc's own `data.branchId`) reaches `StockAdjustForm`'s `branchId`
  prop and `StockTransferForm`'s `sourceBranchId` prop, which forward it
  directly into their respective `fetch` request bodies — the write
  target is the row's real branch, not the viewer's.
- Zero styling/className/JSX changes anywhere in the diff — the
  inverse-direction scope-creep check (this phase must not restyle
  anything) passes clean.
- `StockAdjustForm.tsx`/`StockTransferForm.tsx`'s own internal logic
  (`quantityDelta` sign computation, transfer validation) sit entirely
  outside every diff hunk — confirmed untouched.
- No API route file appears anywhere in the diff.

## Live verification (required this phase, performed)

Used real accounts already in `erp-lfd` from Phase 8/8.1 — no new test
data was created. Signed in via the same custom-token technique
(`admin.auth().createCustomToken(uid)` → Identity Toolkit REST exchange
→ POST the resulting ID token to `/api/auth/session`, same-origin fetch
from the browser so the session cookie is set by the browser itself,
never a stored or guessed password). The browser's pre-existing
`super_admin` session was restored afterward, and all temporary scripts
containing live ID tokens were deleted immediately after use — never
committed.

- **`super_admin` (Downtown):** `/staff` showed all 5 staff spanning both
  branches; `/roles` showed the same 5 staff across both branches in
  "Staff by role"; `/stock` showed all 4 rows (Bottled Water 500ml: 8 and
  9; Phone Charging Cable: 9 and 13 — 2 products × 2 branches).
  `/departments` had 0 docs in this environment — inconclusive on
  cross-branch visibility specifically (no data to distinguish by), but
  confirmed no error/restriction on the read itself.
- **`branch_manager` (Ikeja):** `/staff` and `/roles` both correctly
  redirected to `/dashboard?error=not-authorized` — gate unchanged,
  `branch_manager` never had access to begin with. `/stock` showed
  exactly 2 rows (Bottled Water 500ml: 8, Phone Charging Cable: 13).
- **`branch_manager` (Downtown):** `/stock` showed exactly the
  complementary 2 rows (Phone Charging Cable: 9, Bottled Water 500ml: 9).
- **Ikeja's 2 rows + Downtown's 2 rows = exactly the super_admin's 4
  rows, no overlap, no gap** — airtight, hand-verifiable confirmation of
  correct per-branch partitioning for branch-locked roles and correct
  org-wide aggregation for org-wide roles.
- **Not performed, by explicit choice:** an actual state-changing
  cross-branch Adjust/Transfer write (e.g. a real restock against a
  foreign-branch row, to watch the correct `productStock` doc update
  live). Offered as an option; you chose to skip it, judging the Opus
  task reviewer's hand-traced confirmation of the exact request body
  (already proven to carry the row's real `branchId`) sufficient
  alongside the read-side proof above. This was an explicit, informed
  decision, not a skipped step.

## Findings from the final whole-branch review

Zero Critical or Important findings. Two Minor, both pre-existing and
explicitly out of scope, noted for the record rather than fixed here:

- `stock/page.tsx`'s low-stock comparison uses `quantity < reorderThreshold`,
  while CLAUDE.md documents the canonical rule as `quantity <=
  reorderThreshold` (the app/Cloud-Function parity rule from Phase 7).
  This line is an unchanged context line in this diff — pre-existing,
  unrelated to branch-scoping, not this phase's job to fix.
- `roles/page.tsx` still has pre-Phase-9 styling (`text-xl font-semibold`,
  `text-sm text-gray-600`) rather than the design-system treatment other
  screens have gotten — correct for this phase (styling was explicitly
  out of scope), just a note for whichever future design-rollout phase
  reaches `roles`.

## Final whole-branch review verdict

**Ready to merge: Yes.** Zero Critical or Important findings across
both task reviews and the final whole-branch review. The two Minor,
non-blocking, pre-existing observations above are recorded for a future
phase, not acted on here.
