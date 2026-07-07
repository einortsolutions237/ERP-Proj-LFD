# Technical Debt

Tracked deviations, deferred hardening, and known limitations accepted during a phase — each item names the phase it was deferred to.

## TD-1: Audit log before/after snapshots for update operations

**Deferred to:** Phase 2.1 or Phase 3 Hardening (not blocking Phase 2 completion — accepted as a known limitation, see `docs/superpowers/plans/2026-07-01-phase-2-uat-checklist.md`).

**Found during:** Phase 2 (Catalog & Inventory) live UAT prep, 2026-07-02.

**Current state:** `writeAuditLog()` (`src/lib/audit/log.ts`) records `action`, `actorUid`, `actorEmail`, `targetUid`, `branchId`, and an optional `details` object. For every Phase 2 create/edit/delete call site (suppliers, products, services), `details` is omitted entirely — the log proves *that* a record changed and *who* changed it, but not *what* changed. `stock_adjust`/`stock_transfer`/`permission_change` are the only actions that populate `details`, and even those carry the delta/reason, not a full before/after diff of the whole record.

**Proposed enhancement:** add an optional before/after snapshot to `details` for edit operations, where practical — e.g. `details: { before: {...changedFieldsOnly}, after: {...changedFieldsOnly} }`, capturing only the fields that were actually part of the whitelisted edit (not a full-document dump). Applies to `supplier_edit`, `product_edit`, `service_edit`, and any future edit actions.

**Constraints for the fix (per project decision):**
- Reuse the existing `writeAuditLog()` / `AuditLogEntry` framework — `details: Record<string, unknown> | null` already supports this without a schema change.
- Must be backwards compatible: existing entries without a before/after snapshot remain valid and readable; the audit log viewer (`/audit-log`) must not assume `details.before`/`details.after` exist.
- Scope to "where practical" — a route already has the pre-write doc read in hand for `PATCH` handlers (e.g. suppliers'/products' partial-update pattern already reads `existing` before merging), so the "before" snapshot is close to free; "after" is just the fields actually written. Don't add a new read solely to support this if a route doesn't already read the existing doc.
- Not required for `_create`/`_delete` actions — create has no "before", delete's "after" is just "gone"; only `_edit` actions are in scope for this enhancement.

## TD-2: Low-stock notification's "quantity before this movement" has a race window

**Deferred to:** Not scheduled — accepted as a known limitation for Phase 6 (not blocking Phase 6 completion; see `docs/superpowers/plans/2026-07-02-phase-6-notifications.md`).

**Found during:** Phase 6 (In-App Notifications) planning, 2026-07-02.

**Current state:** `functions/src/lowStock.ts`'s `onLowStock` trigger fires on every `stockMovements` create and must decide whether this specific movement newly crossed the product's `reorderThreshold`. It reconstructs "quantity before this movement" as `productStock.quantity (read live, after the trigger fires) - thisMovement.quantityDelta`. This is correct only if no *other* movement for the same product+branch lands between the original write's transaction committing and this handler's read. If a second movement does land in that window, the live `productStock.quantity` already reflects both movements, and the reconstructed "before" value is wrong — it could cause a missed notification (a real crossing not detected) or, less likely, a spurious one.

**Why not fixed now:** the only way to close this is for `stockMovements` itself to snapshot the resulting quantity at write time, but that means adding a field to the write path in `api/stock/movements/route.ts`/`api/stock/transfer/route.ts`/`api/sales/route.ts` — the exact already-audited files this phase was built specifically to avoid touching (see Phase 6's plan). Fixing TD-2 by touching those files is a legitimate future option, just not one available inside Phase 6's own constraints.

**Proposed enhancement (for whenever this gets prioritized):** add a `resultingQuantity` field to `StockMovement`, written inside the same transaction that already increments `productStock.quantity` (the value is already known there — `FieldValue.increment`'s result isn't readable in the same transaction, but the transaction can compute and set the exact resulting number directly instead of using `increment()`, or read-after-increment within the transaction). Then `onLowStock` reads `resultingQuantity` directly off the movement doc instead of reconstructing it, eliminating the race entirely.

**Constraints for the fix (per project decision):** whichever future phase does this must go through the same review rigor as any other change to `api/stock/movements/route.ts`/`api/stock/transfer/route.ts`/`api/sales/route.ts` (Opus-tier review for the transaction change, per this project's established practice for high-stakes Firestore transactions).

## TD-3: Customer deletion doesn't check for dependent clinical records — RESOLVED (Phase 15, 2026-07-05)

**Originally found during:** Phase 13 (Clinical Foundation), 2026-07-04; scope confirmed to also cover `appointments` during Phase 14 (Appointments), 2026-07-05; resolved comprehensively in Phase 15 (Laboratory), 2026-07-05; extended to a fifth collection in Phase 16 (Health Seminars & Protocol), 2026-07-06.

**Resolution:** `DELETE /api/customers/[id]` now checks `sales`, `treatments`, `appointments`, `labOrders`, and `seminarAttendance` independently (each a `where('customerId', '==', id).limit(1)` existence check mirroring the original `sales` pattern), rather than adding one more narrow check per collection as each new module landed. Live-verified in Phase 15: a customer referenced by only a lab order (no sales/treatments/appointments) is correctly blocked with a lab-order-specific message. Live-verified in Phase 16: a freshly-created customer referenced by only a seminar attendance record is correctly blocked with a seminar-attendance-specific message — proving the fifth check fires independently too, not just compiling alongside the others. No check against `labResults` is needed — a result always belongs to an order that already references the customer, so blocking on `labOrders` transitively covers it.

**Standing question, still open:** the fifth dependent collection Phase 15's report anticipated has now arrived (`seminarAttendance`, Phase 16), and — per Phase 16's own explicit scope boundary — this was resolved by adding the fifth check, not by revisiting the model. The question of whether this allowlist-of-dependent-collections shape remains the right long-term approach, or whether customer deletion should become a soft-delete/archive once *any* history exists (commercial or clinical), is **still genuinely open** and now more pressing with five collections in the allowlist. Worth deciding before a sixth dependent collection arrives, not after.

**Constraints for the fix (per project decision):** the soft-delete/archive question remains a real, separate decision — not to be folded into the next phase that happens to touch a dependent collection, the way Phase 16 was explicitly scoped to avoid it. Whichever phase finally makes this call should do so deliberately, not as a byproduct of adding a sixth check.

**Sixth collection arrived, Phase 18 (2026-07-06):** `pendingDeliveries` (introduced by Phase 18's backorder/pending-delivery model) is now the sixth independently-checked collection in this guard, added in the same phase that introduced it — matching the precedent Phase 16 set for `seminarAttendance`. This is the exact trigger point this note named as "worth deciding before a sixth dependent collection arrives" — the soft-delete/archive question itself remains genuinely unresolved and out of scope for Phase 18, per this note's own constraint that the decision be deliberate, not a byproduct of whichever phase happens to add the next check.

## TD-4: A deleted staff member's conversations become permanently unreachable, though the data survives

**Deferred to:** Not scheduled — accepted as a known limitation for Phase 19 (Messaging), per explicit user decision, 2026-07-07.

**Found during:** Phase 19 (Messaging) Task 2 review, 2026-07-07.

**Current state:** `GET /api/messaging/conversations` builds its list of reachable contacts by querying the `staff` collection directly (`candidates`) and only ever looks up a matching `conversations` doc *for* a candidate already in that list — it never surfaces a conversation whose peer no longer has a `staff` doc. Separately, `GET /api/messaging/messages?peerUid=X` (Task 3) resolves the peer via `getMessagingParty()`, which reads the peer's live Firebase Auth custom claims — and `DELETE /api/staff/[staffId]` deletes both the `staff` Firestore doc *and* the Firebase Auth account (`auth.deleteUser`). The combined effect: once a staff member with an active conversation is deleted through the existing, already-audited staff-deletion flow, that conversation disappears from the list *and* its thread becomes unreachable (`getMessagingParty` returns `null`, the thread route responds 404) for the surviving participant — even though the `conversations` doc and every `messages` doc are never deleted and still exist in Firestore. This is the same underlying shape as TD-3 (data outlives the routes that can reach it) but for staff deletion rather than customer deletion, and no dependent-collection guard exists on `DELETE /api/staff/[staffId]` today.

**Why not fixed now:** staff deletion is out of scope for a messaging phase — extending it to block on message history (mirroring TD-3's customer-deletion guard) is a product decision about whether staff deletion should ever be blocked by messaging history at all, not obviously the right call the way it is for clinical/commercial customer records. Surfacing orphaned conversations instead (using the conversation's own denormalized `participantNames`/`participantRoles` as a placeholder for the missing `staff` doc) is a real, scoped alternative fix but was deferred rather than folded into Task 2 on the spot, per this project's standing practice of not letting a phase turn into an unplanned bug hunt of adjacent routes.

**Proposed enhancement (for whenever this gets prioritized):** either (a) have `GET /api/messaging/conversations` also iterate `conversations` docs with no matching `staff` doc and emit them using the conversation's own denormalized `participantNames`/`participantRoles`, with `canReply: false` and a placeholder like "(former staff member)", and extend `GET /api/messaging/messages` to serve message history for such a peer using the same denormalized data instead of a live claims fetch when `getMessagingParty` returns `null` but a conversation doc exists; or (b) add a dependent-collection check to `DELETE /api/staff/[staffId]` mirroring TD-3's pattern, if a future product decision concludes staff deletion should be blocked by unresolved conversation history.

**Constraints for the fix (per project decision):** whichever approach is chosen, it should be a deliberate decision made by a phase that actually needs it, not a byproduct of unrelated work — same discipline TD-3's soft-delete/archive question is held to.

## TD-5: Deactivated (disabled, not deleted) staff remain fully messageable

**Deferred to:** Not scheduled — accepted as a known limitation for Phase 19 (Messaging), per explicit user decision, 2026-07-07.

**Found during:** Phase 19 (Messaging) final whole-branch review, 2026-07-07.

**Current state:** `PATCH /api/staff/[staffId]` deactivation sets `employment.status: 'inactive'` and calls `auth.updateUser(uid, { disabled: true })`, but leaves the `staff` Firestore doc and the account's Firebase Auth custom claims fully intact — only sign-in is blocked. Neither `GET /api/messaging/conversations` (candidate query has no `employment.status` filter) nor `getMessagingParty()` (`getAuth().getUser(uid)` succeeds and returns claims for a disabled account without error) treats a disabled account any differently from an active one. Net effect: a deactivated `branch_manager`/`it_admin`/etc. still appears as a reachable contact, `canMessage` still passes, and a message can still be sent to them — triggering a real `message_received` notification for an account that can no longer log in to ever read it. This is distinct from TD-4 above, which covers *deleted* staff (`getMessagingParty` returns `null`, thread 404s) — deactivation is a different, unhandled state.

**Why not fixed now:** low risk (a dead-letter notification, not a forbidden relationship opening) and, per project decision, this class of gap gets a tracked tech-debt entry rather than expanding a messaging phase into an unplanned audit of every staff-lifecycle interaction.

**Proposed enhancement (for whenever this gets prioritized):** exclude `employment.status === 'inactive'` staff from the candidate set in `GET /api/messaging/conversations`, and have `getMessagingParty()` also read the `staff` doc's `employment.status` and return `null` (or a distinct "recipient inactive" signal) when it's `'inactive'`, so `canMessage` correctly stops passing for a deactivated recipient the same way it already does for a deleted one.

**Constraints for the fix (per project decision):** should be resolved deliberately, same discipline as TD-3/TD-4 — not as a byproduct of unrelated staff-lifecycle work.
