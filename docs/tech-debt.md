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

## TD-3: Customer deletion doesn't check for dependent clinical records

**Deferred to:** Not scheduled — accepted as a known limitation since Phase 13 (not blocking Phase 13 or Phase 14 completion).

**Found during:** Phase 13 (Clinical Foundation), 2026-07-04; scope confirmed to also cover `appointments` during Phase 14 (Appointments), 2026-07-05.

**Current state:** `DELETE /api/customers/[id]` checks the `sales` collection for a referential-integrity block before allowing deletion (the same pattern proven on `suppliers` in Phase 2), but this check was never extended to `treatments` when Phase 13 added that collection, and Phase 14 confirmed the identical gap now also applies to `appointments`. A customer with clinical treatment history or upcoming/past appointments can currently be deleted through the app itself, orphaning those dependent records.

**Proposed enhancement:** add the same `where('customerId', '==', id)` existence check against both `treatments` and `appointments`, mirroring the existing `sales` check exactly.

**Constraints for the fix (per project decision):** worth reconsidering as this grows further — lab results (Phase 15) will be the same problem again — whether an allowlist-of-dependent-collections check is still the right long-term shape, or whether customer deletion should become a soft-delete/archive once *any* history exists (commercial or clinical), rather than re-adding one more hard check per new module. Not fixed in either Phase 13 or Phase 14 because neither phase's own work touched `src/app/api/customers/[id]/route.ts`'s `DELETE` handler, per this project's known-issues policy (fix only when a phase's own work already touches the affected file/area).
