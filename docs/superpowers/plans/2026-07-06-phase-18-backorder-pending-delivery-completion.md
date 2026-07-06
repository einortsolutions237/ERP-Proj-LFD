# Phase 18 — Backorder & Pending Delivery — Completion Report

**Date:** 2026-07-06
**Plan:** `docs/superpowers/plans/2026-07-06-phase-18-backorder-pending-delivery.md`
**Branch:** `worktree-phase-18-backorder-pending-delivery` (isolated git worktree, base `d8af570`)

## Summary

The online-first half of offline-capable POS. `POST /api/sales`'s core checkout transaction — untouched since Phase 3 — now completes a sale even when a product line's requested quantity exceeds available stock: stock decrements to exactly zero (never negative) for that line, `stockMovements` records the actual quantity taken (not requested), and a new `pendingDeliveries` doc tracks the shortfall. A sale that would produce a backorder with no `customerId` attached is rejected (409) before any write happens. A new `pos.delivery.fulfill` capability — `super_admin`/`general_manager`/`branch_manager`/`cashier`, deliberately **not** `admin`, consistent with Phase 17's narrowing — gates both viewing and fulfilling deliveries (full-quantity only, no partial fulfillment this phase). A Cloud Function notifies the branch's `branch_manager` on every new pending delivery. The customer detail page gained a fifth section, "Pending deliveries." `DELETE /api/customers/[id]` gained a sixth dependent-collection check.

## Tasks (7/7 complete, all individually reviewed clean)

1. **Data model, permissions, audit action, rules, indexes** — Opus review, zero findings. `PendingDelivery` type, `pos.delivery.fulfill` capability backed by its own `POS_DELIVERY_FULFILL_ROLES` constant (not composed from an existing list), `pending_delivery_fulfilled` audit action, `pending_delivery` notification type, `pendingDeliveries` fully closed in Firestore rules, two composite indexes.
2. **`api/sales/route.ts` core transaction change** — Opus review, zero findings (independently re-derived by both the task reviewer and the final whole-branch reviewer). The only modification to this transaction's actual logic since Phase 3. Regression-safe: a fully-in-stock sale produces byte-identical writes to before.
3. **`getPendingDeliveries` helper** — Sonnet review, zero findings. Deliberately does *not* audit-log views (operational data, not clinical — matches the `sales`/`stockMovements` precedent, unlike `getAppointments`/`getLabRecords`).
4. **Fulfill endpoint** — Opus review, zero findings. Transaction-guarded: 404/403/409 precedence, audit log fires only after commit, `isBranchLocked()` used for the cross-branch check (the modern pattern, generalizing `void`'s hardcoded role check).
5. **Cloud Function notification trigger** — Sonnet review, zero findings. `branch_manager`-only recipient (not the broader `onLowStock` set), `.create()` + `isAlreadyExistsError` idempotency, `relatedId` = `customerId` matching `lab_result_entered`'s convention.
6. **Customer detail page section** — Sonnet review, zero findings. The four pre-existing sections (Purchase History, Clinical record, Upcoming appointments, Lab orders) confirmed byte-identical by diff. No reachability gap in the page's top-level guard — all four `pos.delivery.fulfill` roles already pass it via an existing capability.
7. **TD-3 sixth check** — Sonnet review, zero findings. `pendingDeliveries` added to the customer-deletion dependent-collection guard; `docs/tech-debt.md`'s TD-3 note updated to record that the sixth-collection trigger point has arrived (the soft-delete/archive question itself remains open, per that note's own constraint).

## Final whole-branch review (Opus)

**Ready to merge: Yes.** Zero Critical/Important findings. One Minor, no-fix-needed observation: a fully-out-of-stock line (`currentQuantity === 0`) produces a zero-delta `stockMovements` entry — harmless, arguably correct (the line did touch the product), flagged only so it wasn't a surprise during live verification. All of the plan's own re-check items (exact role list, transaction ordering/rollback, rules closure, index sufficiency, six-way delete guard, page-section isolation, audit-once semantics) were independently re-verified against the code, not taken on the task reviews' word.

## Live verification — 34/35 checks passed against real `erp-lfd` data

Deployed first: `firestore.rules`, the two new `pendingDeliveries` composite indexes, and the `onPendingDeliveryCreated` Cloud Function. Sessions for five real accounts (`test.admin`, `test.gm`, `downtown.manager`, `ikeja.cashier`, and the real `super_admin`) were minted via Admin-SDK custom-token exchange against a local dev server pointed at `erp-lfd` — no passwords needed or stored. `downtown.manager` (branch_manager) and `ikeja.cashier` (cashier) are at two different real branches, which let cross-branch fulfill rejection be tested directly rather than simulated.

- Normal in-stock sale (2× Bottled Water, no customer): 201, stock decremented by exactly the requested quantity, one `stockMovements` entry at `-2`, no `pendingDeliveries` doc, `sale_create` audit's `backorders` is `[]`. **Regression-safe.**
- Backorder sale with a customer attached (requested 8 more than the 7 remaining): 201, stock landed at exactly 0, `stockMovements.quantityDelta` was `-7` (actual taken, not the requested amount), exactly one `pendingDeliveries` doc with `quantityOwed: 8`, correct `customerId`/`branchId`.
- Identical backorder scenario with no customer: rejected 409 with the specified message; stock unchanged; no stray `pendingDeliveries` doc — the whole transaction rolled back cleanly.
- `admin` got 403 fulfilling a delivery (correctly outside `POS_DELIVERY_FULFILL_ROLES`). `ikeja.cashier` (a different branch) got 403 attempting to fulfill Downtown's delivery — real cross-branch rejection, not simulated.
- `downtown.manager` (the delivery's own branch) fulfilled successfully; status flipped to `fulfilled` with `fulfilledBy`/`fulfilledAt` set; a second fulfill attempt (by `general_manager`) correctly returned 409; exactly one `pending_delivery_fulfilled` audit entry was written.
- The customer detail page rendered the new "Pending deliveries" section and showed the "Fulfilled" status text after the fulfill call.
- The Cloud Function notification fired: a `pending_delivery`-type notification was created with `recipientUid` matching `downtown.manager`'s real uid.
- **TD-3's sixth check — one real, non-obvious finding, not a bug:** the plan asked to verify "a customer referenced by *only* a pending delivery, nothing else" gets blocked. This scenario is **structurally unreachable** in the current data model — a `pendingDeliveries` doc can only ever be created inside the same transaction that writes a `sales` doc with the identical `customerId`, so any customer with a pending delivery is *always* also referenced by a `sales` doc. `DELETE /api/customers/[id]`'s check order (`sales` first, `pendingDeliveries` last) means the `sales` check fires first and blocks the delete before the `pendingDeliveries` check is ever reached. The delete **was** correctly blocked (409, "referenced by a sale") — the customer-deletion protection TD-3 exists for is real and works — but the sixth check itself cannot currently be the one doing the blocking, unlike its five siblings (`treatments`/`appointments`/`labOrders`/`seminarAttendance`, all of which *can* exist independently of a `sales` doc for the same customer). The check is still correct defense-in-depth (it would matter if the `sales` check were ever removed or reordered), just not independently exercisable today. Recorded as-is rather than reworking the test or the code to force a contrived independent-reachability scenario.

Test data left in `erp-lfd`, matching this project's established practice of keeping live-verification fixtures rather than cleaning them up: "Phase 18 Verification Customer" (fulfilled delivery, for the main flow) and "Phase 18 TD-3 Isolation Customer" (blocked-delete demonstration, still has an active sale + unfulfilled pending delivery) — both clearly named as verification data, not production customers.

## Scope boundary held

Nothing in this phase touched: partial fulfillment, the actual offline queue, or connection-loss detection/handling — all explicitly deferred to Phase 18.1, per the plan's own Global Constraints.

## Decisions (all 8, approved as written in the plan, no objections)

1. Backorder-without-customer rejects 409, not 400.
2. One capability (`pos.delivery.fulfill`) gates both viewing and fulfilling.
3. `isBranchLocked()` decides branch scoping for both the list and the fulfill check.
4. Viewing pending deliveries is not audit-logged (only fulfillment is).
5. No standalone `/pending-deliveries` list page — customer-detail-page section only.
6. No `CheckoutForm.tsx`/receipt-page changes — the only new UI is the customer page section.
7. `pendingDeliveries` added as TD-3's sixth check in this phase, even though the phase doesn't otherwise touch that file — because it's exactly tech-debt.md's own named trigger point ("a sixth dependent collection").
8. Notification recipient is `branch_manager` only, not `admin`/`general_manager`/`super_admin`.
