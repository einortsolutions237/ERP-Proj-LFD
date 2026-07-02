# Phase 2 — Live UAT Checklist

Run against the real deployed app (`lfd-erp-4713b`) with real accounts for each role. Check off each item; note actual vs. expected for anything that fails. Phase 2 is not considered complete until every item here passes — this is the gate the roadmap requires before Phase 3 starts.

**Test accounts needed:** at least one `super_admin` (or `admin`), one `branch_manager`, and one role with none of the `inventory.*` capabilities (e.g. `hr_admin` or `finance_admin`) — used throughout for permission-boundary checks. If only one branch currently exists, note that cross-branch transfer/isolation checks (5.5, 6.4) need a second branch created first (via `/branches/new`, `admin.branches.manage`).

**Known gap found while preparing this checklist — read before testing audit logs:** audit log entries for supplier/product/service create/edit/delete record `action`, `actorUid`, `actorEmail`, `targetUid`, and `branchId` — **they do not capture before/after field values** (no diff of what changed). Only `stock_adjust`/`stock_transfer`/`permission_change` entries carry a `details` object, and even those hold the delta/reason, not a full before/after snapshot of the whole record. Section 7 below tests what actually exists; if before/after capture is a hard requirement for you, that's a new scope item for a follow-up task, not something to expect passing today.

---

## 1. Authentication & Rate Limiting

Applies to `super_admin`/`admin` accounts (the server-verified "strict" path). The other four roles use the client SDK directly — Firebase's own `auth/too-many-requests` throttling applies there instead, not this app's rate limiter.

1.1 **Successful login** — log in with correct `super_admin` (or `admin`) credentials. Expect: redirected to `/dashboard`, session cookie set, and an `auditLogs` entry with `action: 'login'`, correct `actorUid`/`actorEmail`/`branchId`.

1.2 **Failed login (wrong password)** — log in with the correct email, wrong password. Expect: 401 "Invalid credentials", and an `auditLogs` entry with `action: 'login_failed'`, `details.source: 'server_verified'`, `details.role`.

1.3 **Failed login (unknown email)** — log in with an email that doesn't exist. Expect: no error revealing the account doesn't exist — same generic client-side flow as a non-strict-role account (response is `{strategy: 'client_sdk'}`, not an explicit "user not found").

1.4 **Lockout after repeated failures** — from a clean rate-limit state (see note below), submit 5 wrong-password attempts for the same `super_admin` email in quick succession. Expect: attempts 1–5 return 401. Attempt 6 (whether wrong OR **correct** password) returns 429 "Too many attempts. Try again later." — confirms the lockout blocks the account, not just repeats of the same wrong password.

1.5 **Lockout is per-email AND per-IP** — after tripping the email lockout in 1.4, confirm a *different*, never-tried-before strict-role email from the *same browser/IP* is also blocked with 429 (the IP counter independently trips at 5 failures too — if you only tried one email 5 times, both counters will have tripped simultaneously here, so this mainly confirms the IP block persists across different target emails).

1.6 **Lockout expiry** — wait 15 minutes after tripping the lockout (or manually delete the `rateLimits/login:email:<email>` and `rateLimits/login:ip:<ip>` docs in the Firestore console to simulate expiry), then log in with correct credentials. Expect: login succeeds normally, and both `rateLimits` docs are deleted (via `clearAttempts`) after the successful login.

1.7 **Rate-limit failure doesn't block login (fail-open)** — this one can't be tested without deliberately breaking Firestore access, so treat it as a code-inspection confirmation rather than a live test: `src/app/api/auth/login/route.ts` wraps all `checkRateLimit`/`recordFailedAttempt`/`clearAttempts` calls so a Firestore error is logged and swallowed rather than 500ing the route. Skip live-testing this; mark as verified-by-code-review (already done in the final branch review).

1.8 **Audit log verification for auth** — confirm `/audit-log` (as `super_admin`/`admin`/`it_admin` — gated by `admin.auditLog.view`) shows all of the above events with correct timestamps, in descending order, and that `login_failed` entries for the four non-strict roles (client-reported, via `/api/auth/login-failed`) show `details.source: 'client_reported'` and are visibly distinguishable from server-verified ones — treat those as best-effort telemetry, not tamper-proof (per the accepted design in CLAUDE.md).

---

## 2. Suppliers (`inventory.suppliers.manage` — super_admin, admin, branch_manager)

2.1 **Create** — as `admin`, go to `/suppliers/new`, create a supplier with name + phone + email + address + notes. Expect: redirected to `/suppliers`, new row appears, `auditLogs` entry `action: 'supplier_create'`.

2.2 **Create with minimal fields** — create a supplier with only `name` (leave phone/email/address/notes blank). Expect: succeeds, `contact: {phone:null,email:null,address:null}`, `notes:null`.

2.3 **Edit** — edit an existing supplier's name and one contact field, leave the others untouched. Expect: succeeds, the untouched contact sub-fields are preserved (not wiped to null), `auditLogs` entry `action: 'supplier_edit'`.

2.4 **Archive** — edit a supplier's Status to "inactive" (this is the `active` toggle, not a separate archive endpoint). Expect: succeeds, supplier shows inactive in the list, still visible/editable.

2.5 **Delete (unreferenced)** — delete a supplier that no product references. Expect: succeeds, row disappears, `auditLogs` entry `action: 'supplier_delete'`.

2.6 **Delete (blocked — referenced)** — create a product with this supplier as `supplierId`, then try to delete the supplier. Expect: 409 "Cannot delete a supplier that is still referenced by a product", supplier NOT deleted.

2.7 **Validation — empty name** — try to create/edit with a blank name. Expect: 400 "name is required" (create) / "name must be a non-empty string" (edit) — no doc written.

2.8 **Permission check — branch_manager** — as `branch_manager`, confirm you CAN reach `/suppliers`, create, edit, and delete (this role has `inventory.suppliers.manage`).

2.9 **Permission check — unauthorized role** — as a role with none of the `inventory.*` capabilities (e.g. `hr_admin`), confirm `/suppliers` redirects to `/dashboard?error=not-authorized`, and a direct `POST /api/suppliers` call returns 403.

2.10 **Audit logging** — confirm every create/edit/delete above produced exactly one `auditLogs` entry with the correct `action`, `actorUid`, `actorEmail`, `targetUid`, and `branchId: null` (suppliers are org-wide, not branch-scoped — this should NEVER show a real branch id).

---

## 3. Products (`inventory.catalog.manage` — super_admin, admin ONLY, branch_manager excluded)

3.1 **Create** — as `admin`, go to `/products/new`, create a product with name/sku/category/unitCost/price/reorderThreshold, and pick a supplier from the dropdown. Expect: succeeds, `auditLogs` entry `action: 'product_create'`, `branchId: null`.

3.2 **Create with no supplier** — create a product with the supplier select left on "None". Expect: succeeds, `supplierId: null`.

3.3 **Edit** — edit price/category on an existing product. Expect: succeeds, `auditLogs` entry `action: 'product_edit'`.

3.4 **Archive** — set a product's Status to inactive via edit. Expect: succeeds, shown as inactive in the list.

3.5 **Delete (unreferenced)** — delete a product with no stock records. Expect: succeeds, `auditLogs` entry `action: 'product_delete'`.

3.6 **Delete (blocked — has stock)** — restock this product at any branch first (see 5.2), then try to delete it. Expect: 409 "Cannot delete a product that has stock records", product NOT deleted.

3.7 **SKU uniqueness — create collision** — create a product with a SKU that already exists. Expect: 409 "A product with this SKU already exists", no new doc written.

3.8 **SKU uniqueness — edit collision** — edit product A's SKU to match product B's existing SKU. Expect: 409, same message, product A's SKU unchanged.

3.9 **SKU uniqueness — edit does not false-positive on self** — edit product A but leave its SKU unchanged (or resubmit the same SKU explicitly). Expect: succeeds — the uniqueness check must not treat "matches itself" as a collision.

3.10 **Reorder threshold** — set a product's `reorderThreshold` to a specific value (e.g. 10); this is verified functionally in section 5 (Low-stock indicator) once stock exists.

3.11 **Validation — negative numbers** — try `unitCost`, `price`, or `reorderThreshold` as a negative number. Expect: 400 with the specific field's "must be a non-negative number" message.

3.12 **Validation — empty required fields** — try blank name/sku/category. Expect: 400 with the specific "is required" / "must be a non-empty string" message per field.

3.13 **Permission check — branch_manager excluded** — as `branch_manager`, confirm `/products` is NOT in the sidebar, `/products` redirects to `/dashboard?error=not-authorized`, and `POST /api/products` returns 403. This is the one place `branch_manager` is intentionally excluded from a catalog capability.

3.14 **Permission check — unauthorized role** — as `hr_admin` (or similar), same as 3.13 — no access.

3.15 **Audit logging** — confirm every create/edit/delete produced exactly one entry, correct `action`/`actorUid`/`targetUid`, `branchId: null` always.

---

## 4. Services (`inventory.catalog.manage` — super_admin, admin ONLY)

4.1 **Create** — create a service with name/category/price/durationMinutes/description. Expect: succeeds, `auditLogs` entry `action: 'service_create'`.

4.2 **Edit** — edit price and duration on an existing service. Expect: succeeds, `auditLogs` entry `action: 'service_edit'`.

4.3 **Archive** — set Status to inactive. Expect: succeeds.

4.4 **Delete** — delete a service. Expect: succeeds unconditionally (no referential guard exists for services — nothing else in Phase 2 references a service by id), `auditLogs` entry `action: 'service_delete'`.

4.5 **Duration validation** — try `durationMinutes = 0`, a negative number, and a non-integer (e.g. 30.5). Expect: 400 "durationMinutes must be an integer of at least 1" in all three cases.

4.6 **Pricing validation** — try a negative `price`. Expect: 400 "price must be a non-negative number". Try `price = 0` — expect this to succeed (0 is valid, not rejected).

4.7 **Validation — empty required fields** — blank name/category. Expect: 400 with the specific message.

4.8 **No scheduling/booking UI anywhere** — confirm there is no calendar, slot picker, or appointment concept anywhere in the Services UI — services in this phase are walk-in/at-time-of-service only, by design.

4.9 **Permission checks** — same pattern as Products (3.13/3.14): `branch_manager` and other non-catalog roles excluded.

4.10 **Audit logging** — confirm every create/edit/delete produced exactly one entry with correct fields, `branchId: null` always.

---

## 5. Inventory / Stock Ledger

Capabilities: `inventory.stock.view` (view-only), `inventory.stock.adjust` (restock/adjustment/waste), `inventory.stock.transfer` — all three are super_admin/admin/branch_manager.

5.1 **Initial stock (no productStock doc yet)** — pick a product that has never had a stock movement at your branch. Confirm it does NOT appear on `/stock` at all yet (no `productStock` doc exists until the first movement) — this is expected, not a bug.

5.2 **Restock** — use the Adjust form, type=restock, magnitude=10, reason="initial stock". Expect: succeeds, product now appears on `/stock` with quantity 10, a `stockMovements` doc with `type:'restock'`, `quantityDelta:10`, `transferId:null`, and `auditLogs` entry `action:'stock_adjust'`, `details:{type:'restock',quantityDelta:10,reason:'initial stock'}`.

5.3 **Adjustment (increase)** — Adjust form, type=adjustment, direction=increase, magnitude=3. Expect: quantity becomes 13, movement `quantityDelta:+3`.

5.4 **Adjustment (decrease)** — type=adjustment, direction=decrease, magnitude=5. Expect: quantity becomes 8, movement `quantityDelta:-5`.

5.5 **Waste** — type=waste, magnitude=2. Expect: quantity becomes 6, movement `quantityDelta:-2`. Try submitting waste with a magnitude larger than current quantity (e.g. 100) — expect 409 "Insufficient stock for this adjustment", quantity unchanged.

5.6 **Negative quantity prevention (adjustment decrease)** — type=adjustment, direction=decrease, magnitude larger than current quantity. Expect: 409 "Insufficient stock for this adjustment", no partial write (re-check quantity afterward — it must be unchanged, not partially decremented).

5.7 **Cross-branch transfer** — requires a second branch. As `admin`, use the Transfer form on a product with stock at the source branch: pick a destination branch, quantity, reason. Expect: succeeds, source branch quantity decreases by the transfer amount, destination branch's `productStock` doc is created/incremented by the same amount, TWO `stockMovements` docs created (`type:'transfer_out'` at source with negative delta, `type:'transfer_in'` at dest with positive delta) sharing the same `transferId`, and ONE `auditLogs` entry `action:'stock_transfer'` with `details.destBranchId`/`quantity`/`transferId`.

5.8 **Transfer — insufficient stock at source** — attempt a transfer larger than the source branch's current quantity. Expect: 409 "Insufficient stock at source branch for this transfer", neither branch's quantity changes.

5.9 **Transfer — source/dest must differ** — attempt a transfer with the same branch as source and destination (if the UI allows selecting it — it shouldn't, since the current branch is excluded from the destination list, so this is really an API-level check). Expect: 400 "Source and destination branch must differ" if forced via direct API call.

5.10 **Transfer — branch_manager restricted to own branch as source** — as `branch_manager`, confirm you can only transfer OUT of your own branch (the UI's stock page only shows your branch's stock, so this is naturally enforced, but confirm a direct `POST /api/stock/transfer` with a different `sourceBranchId` than your own returns 403 "Can only transfer stock out of your own branch"). Confirm `branch_manager` CAN pick any branch as the destination (no restriction there).

5.11 **Adjust — branch_manager restricted to own branch** — as `branch_manager`, confirm a direct `POST /api/stock/movements` with a `branchId` other than your own returns 403 "Can only adjust stock for your own branch".

5.12 **Firestore transaction verification** — after any restock/adjustment/waste/transfer, spot-check in the Firestore console that `productStock.quantity` exactly equals the sum of all `stockMovements.quantityDelta` for that `branchId`+`productId` pair — this is the core invariant of the whole ledger design and should never drift.

5.13 **Stock ledger verification (append-only)** — confirm there is no UI path anywhere to edit or delete an existing `stockMovements` document — every change is a new ledger entry, never a mutation of history.

5.14 **productStock synchronization** — confirm the `/stock` page's displayed quantity always matches what's in the Firestore console for `productStock` immediately after any operation (no caching/staleness — `router.refresh()` should pull fresh data after every form submission).

5.15 **Low-stock indicator** — set a product's `reorderThreshold` to a value above its current quantity (e.g. threshold=20, quantity=6 from the scenario above). Expect: the `/stock` row shows the "Low stock" indicator. Restock above the threshold — expect the indicator disappears.

5.16 **View-only role** — if you have a role with `inventory.stock.view` but not `adjust`/`transfer` (none of the current 6 roles are configured this way, so this may not be testable today — skip if no such role exists) — expect the Actions column to be empty, table still visible.

5.17 **Permission check — no stock capability** — as `hr_admin`/`finance_admin`, confirm `/stock` is not in the sidebar and redirects to `/dashboard?error=not-authorized`.

---

## 6. Security

6.1 **UI permission enforcement** — for each of the 6 roles, confirm the Sidebar shows exactly the expected subset of {Products, Services, Suppliers, Stock} per the capability table below. No role should ever see a link to a page it can't actually use.

| Role | Products | Services | Suppliers | Stock |
|---|---|---|---|---|
| super_admin | yes | yes | yes | yes |
| admin | yes | yes | yes | yes |
| branch_manager | **no** | **no** | yes | yes |
| hr_admin | no | no | no | no |
| finance_admin | no | no | no | no |
| it_admin | no | no | no | no |

6.2 **API permission enforcement** — for a role that shouldn't have access (per the table above), call each API route directly (e.g. via browser devtools fetch or curl with that role's session cookie) and confirm every one returns 403, not just that the UI hides the link. Cover at minimum: `GET/POST /api/products`, `/api/services`, `/api/suppliers`, `/api/stock`, `/api/stock/movements`, `/api/stock/transfer`.

6.3 **Firestore rules verification** — confirm (via the Firebase console Rules Playground, or by attempting a direct client-SDK read/write from browser devtools while logged in) that: `products`/`services`/`suppliers` allow read for any authenticated user but reject ALL writes; `productStock`/`stockMovements` reject reads where the requester's `branchId` custom claim doesn't match the document's `branchId`, and reject all writes; `rateLimits` rejects all reads and writes unconditionally, even for super_admin.

6.4 **Branch isolation** — as `branch_manager` at Branch A, confirm `/stock` never shows Branch B's `productStock` rows, even though the underlying `products`/`services`/`suppliers` catalogs are correctly visible org-wide (that's by design — only stock quantities are branch-scoped, not the catalog).

6.5 **Unauthorized access attempts are logged/observable** — confirm 403 responses from section 6.2 don't accidentally leak data in the response body (should be a bare `{error: 'Forbidden'}` or similar, no partial record data).

6.6 **No client-settable quantity** — confirm there is no form field, UI control, or API parameter anywhere that lets a caller set `productStock.quantity` directly — it must only ever move via `/api/stock/movements` or `/api/stock/transfer`'s `quantityDelta`/`quantity` inputs, which are always relative changes, never an absolute value.

---

## 7. Audit Logs — cross-cutting verification

For every create/edit/delete/archive/adjust/transfer performed across sections 2–5, confirm on `/audit-log`:
- Exactly one entry was created per action (no duplicates, no missing entries).
- `actorUid`/`actorEmail` match whoever performed the action.
- `createdAt` timestamp is accurate (within a few seconds of when you performed the action).
- `action` matches the specific action taken (`supplier_create` vs `supplier_edit` vs `supplier_delete`, etc. — not a generic catch-all).
- `targetUid` correctly identifies the affected record's id.
- `branchId` is `null` for supplier/product/service actions (org-wide), and the correct real branch id for stock actions.
- **Before/after values are NOT present for create/edit/delete entries** (per the known gap noted at the top of this document) — do not fail this checklist item on that basis; it's flagged separately as a scope question for you to decide on, not a bug to verify away.
- `stock_adjust`/`stock_transfer` entries DO carry a `details` object (type/delta/reason, or destBranch/quantity/transferId respectively) — confirm those specific fields are present and correct.

---

## 8. Regression — Phase 1 functionality

Confirm nothing in Phase 2 broke existing functionality:

8.1 **Authentication** — login/logout still works normally for all 6 roles via both the strict and client-SDK paths.

8.2 **Staff** — create/edit/delete staff still works, `staff_create`/`staff_edit`/`staff_delete`/`permission_change` audit entries still generated correctly.

8.3 **Branches** — create/edit/delete still works; deletion is still blocked when staff or departments reference the branch (confirm this Phase 1 guard wasn't affected by any Phase 2 change).

8.4 **Departments** — create/edit/delete still works, still branch-scoped correctly.

8.5 **Settings** — key-value settings CRUD still works.

8.6 **Audit log viewer** — `/audit-log` still renders all Phase 1 action types correctly alongside the new Phase 2 ones, sorted correctly, with the details column still rendering for entries that have one.

8.7 **Navigation** — sidebar still shows all Phase 1 links correctly per role, and the mobile collapsible nav (recent fix) still works without horizontal overflow.

8.8 **Roles/permissions page** — `/roles` still renders and still protects `super_admin` from demotion/deletion.

---

## After this checklist passes

Once every item above passes (or any failures are triaged and either fixed or explicitly accepted), let me know and I'll:
1. Tag the current `HEAD` as the Phase 2 baseline (e.g. `git tag phase-2-complete` — confirming the exact tag name/format with you first).
2. Only then start Phase 3 planning.

If anything fails, report which item number and the actual vs. expected behavior — I'll fix it as a normal bug-fix task before we re-run just that item.
