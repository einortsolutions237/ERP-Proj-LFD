# Phase 20 (Tech Debt Resolution) — Completion Report

**Date:** 2026-07-11

## Summary

Phase 20 resolved the two longest-standing tracked tech-debt items (TD-1, TD-2) and implemented the standing `GET /api/sales` branch-scoping product decision — all three as small, surgical changes to already-audited routes, with zero new collections, capabilities, or UI. Task 1 scoped `GET /api/sales` and the `/pos/sales` page by `isBranchLocked(user.role)` (matching Phase 12's pattern) so org-wide roles see every branch's sales while branch-locked roles stay local, leaving the deliberately-untouched `GET /api/reports/sales` alone. Task 2 (TD-1) added a `details: { before, after }` diff of only the changed fields to `product_edit`/`service_edit`/`supplier_edit`, and the full creation payload to `customer_create`. Tasks 3–4 (TD-2) snapshot the actual post-movement quantity as `resultingQuantity` on every `stockMovements` write from a sale/adjustment/transfer — computed inside the existing transaction — and rewired the deployed `onLowStock` Cloud Function to read it directly instead of reconstructing "quantity before this movement" from a live `productStock` read, closing the race window entirely. The `void` reversal path was deliberately left untouched (its always-positive delta can never trip the crossing check), so its movement docs carry no `resultingQuantity`, and `onLowStock` falls back to the original reconstruction only for such docs and pre-phase historical data.

## Live verification

**24/24 verification checks passed** against real `erp-lfd` data. Sessions for seven accounts were minted via the Admin-SDK custom-token → Identity-Toolkit `signInWithCustomToken` → `POST /api/auth/session` exchange used in prior phases. All writes went through the real dev server against the live `erp-lfd` Firestore, so the deployed `onLowStock` Cloud Function (africa-south1) fired on them. Two attempts prior to this one were interrupted by transient API-connection failures mid-verification; the real, correct artifacts they left (a product/service/supplier edit, a customer create, a normal sale/restock/transfer, a threshold-crossing adjustment, and a void) were checked and reused where they satisfied a criterion, and the criteria that assert live behavior (status codes, response shapes, the race window) were re-exercised fresh in this run.

**Accounts reused (all pre-existing, real):** `super_admin` (`einortsolutions237@gmail.com`), `downtown.manager`/`ikeja.manager` (`branch_manager`, Downtown/Ikeja), `ikeja.cashier` (`cashier`, Ikeja), `test.admin` (`admin`), `test.gm` (`general_manager`), `finance.admin` (`finance_admin`). Two branches: Downtown (`H5Rn9e7PsVYrYG6gqdJy`), Ikeja (`TZ4Pqp4Iqpxib6GnXHv0`).

### Task 1 — sales branch scoping (Steps 1–2)

`GET /api/sales`, using the corrected role list (`pos.sale.view` = `super_admin`/`branch_manager`/`cashier` only after Phase 17):

- **super_admin** → 200, **14 sales spanning both branches** (org-wide, not branch-locked). ✓
- **downtown_manager** → 200, **8 sales, Downtown only**. ✓
- **ikeja_manager** → 200, **6 sales, Ikeja only**. ✓
- **ikeja_cashier** → 200, **6 sales, Ikeja only**. ✓
- **admin / general_manager / finance_admin** → **403 Forbidden** each (they never hold `pos.sale.view`; the scoping change is moot for them). ✓

`/pos/sales` page render (page-level fix, same `isBranchLocked` branch as the API): super_admin renders **14** table rows, downtown_manager **8**, ikeja_cashier **6** — exactly matching each role's API scope, all HTTP 200. ✓ (3 checks)

`GET /api/reports/sales` (Step 2 — deliberately not touched, still scopes only `branch_manager` to its own branch via `role === 'branch_manager'`): downtown_manager sees Downtown only (8 non-voided), ikeja_manager sees Ikeja only (5 non-voided, 1 voided), general_manager sees **both branches** (13 non-voided, 1 voided). Unchanged from pre-phase behavior. ✓ (3 checks)

### Task 2 — TD-1 audit detail (Step 3)

- **product_edit** (fresh this run — changed `price` only, `500`→`525`): audit `details = { before: { price: 500 }, after: { price: 525 } }` — only the changed field appears; the untouched `reorderThreshold` is absent from both `before` and `after`. Price reverted to 500 afterward. ✓
- **service_edit** (reused prior-attempt artifact): `details = { before: { price: 1000 }, after: { price: 1100 } }` — only `price`. ✓
- **supplier_edit** (reused prior-attempt artifact): `details = { before: { contact: {...} }, after: { contact: {...} } }` — only the changed `contact` field. ✓
- **customer_create** (fresh this run): `details` matched the creation payload exactly — `name`/`phone`/`email`/`address`/`notes`/`registeredBranchId` all equal to what was written. ✓

### Tasks 3–4 — TD-2 `resultingQuantity` (Steps 4–6)

**Step 4 — regression (the check that matters most):** each write behaved identically to its pre-phase behavior and its movement doc's `resultingQuantity` equalled the true post-write `productStock.quantity`:

- **normal sale** (ikeja_cashier, 1 cable at Ikeja): 201; stock 8→7; movement `type: sale`, `quantityDelta: -1`, `resultingQuantity: 7`. ✓
- **normal restock** (super_admin, +3 cable at Ikeja): 201; stock 7→10; `type: restock`, `quantityDelta: 3`, `resultingQuantity: 10`. ✓
- **normal transfer** (super_admin, 1 cable Ikeja→Downtown): 201; source 10→9, dest 2→3; `transfer_out resultingQuantity: 9`, `transfer_in resultingQuantity: 3`. ✓

**Step 5 — crossing + the race-window fix:**

- **Threshold crossing:** a waste of −6 on Downtown "Bottled Water 500ml" (reorder threshold 5) took it 10→4. Exactly **one** low-stock event fired (fanned to the 3-recipient org-admin-inclusive set: the branch's manager, super_admin, admin), body: *"…is at **4 units** (reorder threshold 5)"* — the quantity equals the movement's own `resultingQuantity`, confirming `onLowStock` reads the snapshot, not a fresh `productStock` read. ✓
- **No spurious fire:** a restock of +6 taking it back 4→10 (above threshold) fired **zero** notifications. ✓
- **Direct race-window demonstration:** two waste movements were fired for the same product+branch within milliseconds — M1 (−6, 10→4, crosses) and M2 (−1, 4→3, does not cross). By the time `onLowStock` read, live `productStock` was already **3** (polluted by M2). The M1 notification reported **"at 4 units"** — M1's own `resultingQuantity` — **not** the polluted "at 3 units" the old reconstruction (`live quantity − delta`) would have produced. M2 correctly produced no notification. This is the race the fix closes, exercised and proven, not merely reasoned about. ✓ (Corroborated by a prior-attempt natural artifact: two rapid adjustments at 06:51:45/47 where only the crossing one notified.)
- **Deployment confirmation:** `firebase functions:log --only onLowStock` shows an `UpdateFunction` at `2026-07-11T06:37:41Z` leaving the function `ACTIVE`, and invocation log lines coinciding with each verification write — the resolved version is the one live in `erp-lfd`.

**Step 6 — void (untouched path):** voiding the Step-4 sale returned 200, restored the Ikeja cable stock by +1 (9→10), and its reversal movement (`type: void`, `quantityDelta: +1`) carries **no `resultingQuantity` field** — confirming the void path was correctly left alone. It fired **zero** low-stock notifications (positive delta can't cross downward), and nothing that reads `stockMovements` (reporting, void reversal) chokes on the absent field. ✓

## Data left in `erp-lfd`

Per the standing decision that synthetic verification fixtures in `erp-lfd` are treated as permanent, nothing was deleted. Net stock positions were restored where a test deliberately depleted them (Downtown water returned to 10; the product-price edit was reverted to 500). Created and left in place: the fresh verification sale (later voided), the fresh customer "Phase20 Task5 Customer", the associated `stockMovements` ledger entries (sale/restock/transfer/waste/void plus the two race-demo wastes and their restores), and every resulting audit-log and notification doc — all real forward-moving history, matching every prior phase. The prior two attempts' artifacts (Phase20 Verify Customer/Supplier, their edits, and the earlier crossing/void) likewise remain.

## Doc updates in this phase

- `CLAUDE.md`: added the Phase 20 completion paragraph; updated "Current status" and the roadmap line; resolved the top-of-file `GET /api/sales` "open product question" note (decision now implemented); marked TD-1/TD-2 resolved in the Known-issues policy section (following TD-3's resolution-wording precedent).
- `docs/tech-debt.md`: TD-1 and TD-2 marked `— RESOLVED (Phase 20, 2026-07-11)` with a Resolution paragraph each, keeping the original problem descriptions intact (same pattern as TD-3's resolution entry).

## Outstanding / not in this phase

- The TD-3 soft-delete/archive question and the broader Phase 20 stabilization scope (monitoring/backup/DR/staging, UAT) remain open — Phase 20 as run here was the tech-debt-resolution slice (TD-1/TD-2 + the `GET /api/sales` decision), not the full release-candidate hardening.
- TD-4 and TD-5 (messaging staff-lifecycle gaps) remain accepted, deliberately deferred.
- `resultingQuantity` is intentionally absent on `void` reversals and on all pre-phase historical `stockMovements`; `onLowStock`'s documented reconstruction fallback covers both cases and is provably irrelevant for void's always-positive delta.
