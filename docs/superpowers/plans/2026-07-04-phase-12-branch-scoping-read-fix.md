# Phase 12 — Branch-Scoping Read Fix (Plan)

> Behavior fix, not presentation. Zero styling/className/JSX-structure
> changes beyond what the query-logic fix strictly requires in each file.

## The confirmed bug (per CLAUDE.md's Phase 10/11 notes)

`staff/page.tsx`, `departments/page.tsx`, and `stock/page.tsx` each read
their collection directly from Firestore with a hardcoded
`.where('branchId', '==', user.branchId)`, applied unconditionally to
every role — never inheriting the `isBranchLocked()`-gated scoping their
sibling API routes (`GET /api/staff`, `GET /api/departments`, `GET
/api/stock`) already got in Phase 8. Net effect: org-wide roles
(`super_admin`/`admin`/`hr_admin` for staff; `super_admin`/`admin` for
departments/stock) are silently restricted to their own branch on these
three pages, when they should see every branch.

## Sweep results — every `page.tsx` under `(dashboard)` checked

Grepped every dashboard page for `branchId` and read each hit in context.
Full accounting, not just the fixes:

### Confirmed instances of the bug — to fix (4, not 3)

| File | Capability gate | Who's wrongly restricted today |
|---|---|---|
| `staff/page.tsx:16` | `admin.staff.view` (`ADMIN_HR`) | `super_admin`/`admin`/`hr_admin` |
| `departments/page.tsx:16` | `admin.departments.manage` (`ADMIN_BRANCH_MGR`) | `super_admin`/`admin` |
| `stock/page.tsx:18` | `inventory.stock.view` (`ADMIN_BRANCH_MGR`) | `super_admin`/`admin` |
| `roles/page.tsx:18` | `admin.roles.view` (`ADMIN_HR`) | `super_admin`/`admin`/`hr_admin` |

**`roles/page.tsx` is a newly-found 4th instance** — same exact
anti-pattern (`getAdminFirestore().collection('staff').where('branchId',
'==', user.branchId).get()`), same `ADMIN_HR` capability set (none of
which are branch-locked), just never flagged before because no prior
phase touched this file. There is no sibling `api/roles` route to mirror
(this page is the only reader), so the fix mirrors `api/staff/route.ts`'s
pattern directly instead, since it queries the same `staff` collection
for the same "who can see which staff" question.

### Checked, correctly branch-locked-always by design — not touched

- **`pos/page.tsx:19`** (`productStock` read for checkout) — a sale
  happens at one physical register/branch regardless of who's operating
  it, the same reasoning CLAUDE.md already documents for `POST
  /api/sales` being deliberately `user.branchId`-always even for
  org-wide roles ("a sale is tied to wherever the cashier/register
  physically is, not a branch you're assigning"). Correct as-is.
- **`customers/[id]/page.tsx:44`** (purchase-history sales query) —
  already confirmed correct and branch-scoped-on-purpose in the Phase 11
  review ("no cross-branch exception"). Not this bug class at all — it's
  reading a branch-scoped collection (`sales`) correctly, not
  mis-scoping an org-wide collection.
- **`staff/[staffId]/page.tsx:39`**, **`departments/[id]/page.tsx:24`** —
  these are branch-mismatch-treated-as-404 *privacy checks* on a single
  document fetch, not list-scoping. Different mechanism, already correct,
  confirmed untouched in Phase 11.
- **`branches/page.tsx`** — genuinely unfiltered, correctly: branches
  carry no `branchId` field of their own (a branch document IS the
  branch). Confirmed correct in Phase 11.
- **`dashboard/page.tsx`**, **`settings/page.tsx`** — no query-level
  branchId filtering at all (just displaying `user.branchId` as text, or
  a comment confirming the settings collection is global-only).
- **`reports/inventory/page.tsx`**, **`reports/sales/page.tsx`** — the
  `branchId` hits here are React `key` props on already-aggregated rows,
  not query filters. These reports already aggregate across all branches
  server-side (Phase 7); nothing to fix.

### Already correctly role-gated — not touched

- **`attendance/page.tsx`**, **`leave/review/page.tsx`** — both already
  branch on `user.role === 'branch_manager'` (ternary, not
  `isBranchLocked()`, but equivalent in practice: `cashier` — the only
  other branch-locked role — never holds `hr.attendance.view` or
  `hr.leave.approve`, so there's no role today for which this ternary and
  `isBranchLocked()` would disagree). Matches CLAUDE.md's Phase 5 HR
  section exactly ("branch_manager sees only their own branch's
  requests/attendance ... hr_admin/admin/super_admin see every branch").
  Not touched.

### Found, but explicitly NOT part of this bug class — flagging, not fixing

- **`pos/sales/page.tsx:17`** (sales log) — reads `sales` with a
  hardcoded, unconditional `where('branchId', '==', user.branchId')`,
  same textual shape as the confirmed bugs. But **its sibling route,
  `GET /api/sales`, has the identical unconditional filter** (verified:
  `src/app/api/sales/route.ts:30`, no `isBranchLocked()` anywhere in the
  file) — unlike staff/departments/stock/roles, where the API route
  *was* already fixed in Phase 8 and the page just never caught up. For
  sales there is no already-decided "correct" pattern to mirror; CLAUDE.md
  already carries this forward explicitly as an open, undecided question
  ("`GET /api/sales`'s branch-filter question remains explicitly
  undecided"). Fixing the page here would mean unilaterally deciding that
  open question inside a phase scoped as "restore an already-decided
  pattern," not decide a new one. **Not touched. Carried forward
  unchanged, same as every prior phase.**

## The one complication — Stock needs more than the 3-line fix, flagging per your instruction

The query fix itself is trivial and identical in shape for all four
files. But for `stock/page.tsx` specifically, applying *only* the query
fix would silently introduce a **new, real correctness bug** that
doesn't exist today, masked by the very bug this phase fixes:

`StockTable.tsx` receives one page-level `branchId` prop (=
`user.branchId`) and passes it *unconditionally to every row's*
Adjust/Transfer form (`StockAdjustForm`'s `branchId` prop,
`StockTransferForm`'s `sourceBranchId` prop) — not each row's own
branch. Today this is harmless because the buggy query only ever returns
rows from the viewer's own branch, so "the ambient branchId" and "this
row's real branch" always happen to be the same value. `super_admin`/
`admin` already hold `inventory.stock.adjust`/`inventory.stock.transfer`
(`ADMIN_BRANCH_MGR`) — they are not branch-locked, and once the query fix
lands, they will see rows from every branch. The moment they click
Adjust or Transfer on a row from a branch that isn't their own, the form
will silently submit against **their own branch**, not the row's actual
branch — e.g. clicking "Adjust" on a Downtown-branch row while
logged in as an admin whose `user.branchId` is Ikeja would write the
adjustment against `productStock` doc `ikeja_<productId>`, not
`downtown_<productId>`, while the on-screen row still shows Downtown's
quantity. The server-side routes (`api/stock/movements`,
`api/stock/transfer`) aren't at fault here — they already correctly
accept and validate an explicit `branchId`/`sourceBranchId` for
non-branch-locked roles (Phase 8's design); the bug is entirely that the
*client* never had a per-row branch to send until now, because the
query never returned more than one branch's rows to send it from.

There's a second, smaller instance of the same root cause: the
"destination branches" list passed to `StockTransferForm` is computed
once, page-level, as "every branch except `user.branchId`"
(`stock/page.tsx:48-50`). Once an admin can see (and transfer) rows from
a branch other than their own, that exclusion should be relative to
*that row's* source branch, not the viewer's — otherwise an admin
transferring a Downtown row could still be offered Downtown itself as a
destination.

**Proposed fix (this is the part I want explicit sign-off on, not just
proceeding):**
1. Add `branchId: string` to the `StockRow` interface, populated from
   each `productStock` doc's own `data.branchId` field (already stored on
   every doc by the movements/transfer routes — no new data needed).
2. `StockTable.tsx`: pass `row.branchId` to `StockAdjustForm`'s
   `branchId` prop and to `StockTransferForm`'s `sourceBranchId` prop,
   instead of the single page-level `branchId` prop.
3. `stock/page.tsx`: compute the destination-branches list per row
   instead of once — pass the full `branches` list through and let
   `StockTransferForm` (or `StockTable`, at render time) exclude
   `row.branchId` rather than `user.branchId`. (Smallest version of this:
   keep passing the full unfiltered `branches` list down and do the
   `.filter((b) => b.id !== row.branchId)` exclusion at the point
   `StockTransferForm` is rendered in `StockTable.tsx`, right next to
   where `sourceBranchId` is already being picked per-row.)
4. The page-level `branchId` prop on `StockTable` becomes unused for the
   per-row forms; keep it only if something else still needs "the
   viewer's own branch" as a concept (double-check before removing it
   outright — it's currently *only* consumed by the two lines being
   changed here, so it's likely fully removable, but that's a
   confirm-by-reading-the-diff step for the task, not an assumption to
   bake into the brief).

This is a larger diff than "add an `isBranchLocked` ternary," and it's a
new-code addition (a `branchId` field on `StockRow`), not a pure
restyle-reversal — which is why I'm flagging it explicitly rather than
either quietly expanding scope or shipping a query fix I already know
creates a new bug. If you'd rather this per-row threading be a separate,
follow-up phase and Phase 12 ship *only* the query fix for Stock (with
this newly-introduced risk documented and explicitly accepted, e.g. by
restricting the phase-12 stock query fix to leave Adjust/Transfer
capability effectively unsafe for cross-branch rows until follow-up),
that's your call to make, not mine to assume.

## The fix (staff/departments/roles — identical shape)

Each of `staff/page.tsx`, `departments/page.tsx`, `roles/page.tsx`
replaces its hardcoded `.where('branchId', '==', user.branchId)` line
with:

```ts
const collection = getAdminFirestore().collection('staff') // or 'departments'
const snap = isBranchLocked(user.role)
  ? await collection.where('branchId', '==', user.branchId).get()
  : await collection.get()
```

matching `api/staff/route.ts`/`api/departments/route.ts`'s exact existing
conditional (import `isBranchLocked` from `@/lib/auth/permissions` in
each file — not currently imported in any of the three). Nothing else in
these three files changes: same capability gate, same row-mapping logic,
same JSX.

`stock/page.tsx` gets the same ternary for its `productStock` query, plus
whatever the per-row `branchId` threading decision above resolves to.

## Live verification plan (required this phase, per your instruction)

Real accounts from Phase 8/8.1 should still exist in `erp-lfd`: a
Downtown `branch_manager`, an Ikeja `branch_manager`, and org-wide
`super_admin`/`admin`/`hr_admin`/`finance_admin` accounts. No new test
data will be created — signing in will use the same custom-token
technique Phase 8/8.1 used (`admin.auth().createCustomToken(uid)` via a
one-off Admin SDK script, then `signInWithCustomToken` client-side),
never a stored or guessed password, and never a new Auth user or
Firestore doc.

Verification matrix (before the fix is live, then after, for each of
staff/departments/stock/roles):
- **`branch_manager`** (both Downtown and Ikeja, in turn): confirm the
  page shows *only* their own branch's rows, unchanged from before the
  fix. (Departments/roles/staff — `branch_manager` isn't in
  `ADMIN_HR`/`ADMIN_BRANCH_MGR` for `admin.staff.view`/`admin.roles.view`
  today, so may 403 rather than render — confirming that gate itself is
  unchanged is part of the check, not a surprise.)
- **`super_admin`/`admin`** (whichever real org-wide account is
  available): confirm the page now shows rows from *both* branches — the
  actual fix — where it previously (bug) showed only the signed-in
  admin's own branch.
- **Stock specifically, if the per-row fix above is approved**: also
  confirm that Adjust/Transfer, exercised against a row from a branch
  other than the admin's own, writes to the *correct* branch's
  `productStock` doc (checked via the resulting on-screen quantity change
  on that row, and/or a direct read of the `stockMovements`/`productStock`
  docs written) — this is the one piece of this phase that needs an
  actual state-changing action, not just a read comparison, so it should
  only be exercised with your go-ahead on real data, same as every prior
  phase's data-write policy.

## Review tier

Opus, for all of it — this is access-control-relevant (which role sees
which branch's data), matching Phase 8's established precedent of "Opus
for every access-control-relevant" task, not the Sonnet-tier used for
Phase 10/11's pure-restyle tasks.

## Confirmed untouched — protected files this phase must not need to change

`src/app/api/staff/route.ts`, `src/app/api/departments/route.ts`,
`src/app/api/stock/route.ts`, `src/app/api/stock/movements/route.ts`,
`src/app/api/stock/transfer/route.ts` — all already correct since Phase
8; this phase brings the *pages* in line with routes that don't
themselves need to change.

## Execution

Two tasks:
1. **staff/departments/roles** (3 files, identical minimal ternary fix) —
   Opus review.
2. **stock** (query fix + whatever per-row threading scope you approve
   above) — Opus review, separately, given the larger diff and the
   transaction-adjacent stakes (this task can touch `productStock`
   writes indirectly through the forms it's changing the props of, even
   though it's not touching the transaction routes themselves).

Then live verification (controller-driven, via browser automation +
custom-token sign-in, not delegated to a subagent — this needs
interactive judgment against the real running app), then a completion
report matching Phases 10/11's level of detail: which files changed,
confirmation the 5 API routes above are untouched, the full sweep
results table above reproduced with a "checked, not touched" column, and
the live-verification matrix results.
