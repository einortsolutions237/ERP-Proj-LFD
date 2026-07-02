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
