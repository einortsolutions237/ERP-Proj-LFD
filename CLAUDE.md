# LFD Services — Enterprise ERP

## What
Enterprise ERP for LFD Services (starting as a single location, architected for multi-branch growth). Supersedes the earlier "MediCore ERP" healthcare-domain scope — this is a business/retail-and-services enterprise design spanning POS, inventory, CRM, accounting, and HR.

Stack: Next.js (App Router) + TypeScript + Tailwind CSS, Firebase Auth + Firestore + Cloud Functions, deployed on Vercel. Firebase project: `lfd-erp-4713b`.

Architecture: modular monolith, not microservices — clean module boundaries inside one Next.js app. Every record carries a `branchId` and every permission check is branch-scoped, starting from Phase 1, even though only one branch exists today.

## Why
LFD Services needs one system to replace fragmented/manual operations — starting with staffing and access control, extending to POS, inventory, CRM, accounting, and HR. Full module vision: `docs/project-brief.md`.

## How

**Permissions** — 6 roles: super_admin (protected, immutable, cannot be demoted or deleted in-app), admin, branch_manager, hr_admin, finance_admin, it_admin. Permissions are mapped per module (POS, inventory, CRM, accounting, HR) — not by role alone — and enforced at three layers: UI, server, Firestore rules, never just one. Firebase custom claims (`role`, `branchId`) are the sole source of truth for authorization; Firestore is profile metadata only and is never read to make an access-control decision.

**Never repeat these — each caused a real production issue in an earlier build of this project:**
- No Proxy-based Firebase SDK initialization — use direct SDK calls
- No hardcoded Firebase credentials or fallback values in client code — env vars only, no `??` fallback to literals
- Don't let tooling silently regenerate/empty `tsconfig.json` — verify it after any AI-assisted scaffold
- No `Math.random()` for temporary passwords or any security-sensitive value — use a CSPRNG
- Firestore rules default-deny; every collection needs an explicit, tested rule — no blanket permissive rules
- Session cookies: don't hardcode `secure: true` + `sameSite: none` — it silently drops cookies in non-HTTPS preview environments
- No public self-registration route — accounts are created by a permitted internal role only
- Cloud Functions v2, not v1 (deprecated)

**Audit log** — every login, failed login, logout, and create/edit/delete on customers, staff, or permissions gets an immutable log entry, written server-side only. Never expose an edit or delete path for audit entries.

**Login has two paths, chosen server-side by account role, not by the client:**
- `super_admin` and `admin` (the roles where a failed-login attempt is the highest-value security signal) verify the password server-side against the Identity Toolkit REST API. Every attempt — success or failure — is written to the audit log by code we control; this path is tamper-proof.
- `branch_manager`, `hr_admin`, `finance_admin`, `it_admin` sign in via the Firebase client SDK directly. A failed attempt never reaches our server on its own — the client reports it best-effort after the fact. Treat these `login_failed` entries as telemetry, not a tamper-proof control; this is an accepted trade-off, not a gap to silently fix later.
- The routing decision (which path a given email uses) is made by a pre-flight server lookup of the account's role before any password is checked — this necessarily reveals whether a given email belongs to a `super_admin`/`admin` account (a narrow account-role signal, not full account-existence enumeration — unknown emails and non-strict-role emails get an identical response). Accepted for an internal-only ERP; revisit if this app ever gets external-facing accounts.

**Catalog & stock ownership** — `products` and `services` are org-wide catalog entries, not branch-scoped (a SKU/price is the same everywhere). What's branch-specific is *quantity on hand*: `productStock` holds one doc per branch+product, and its `quantity` is a derived, server-maintained total — never directly settable. Every stock change writes an immutable `stockMovements` ledger entry (restock/adjustment/waste/transfer_out/transfer_in/sale/void), and the same Admin-SDK write path that creates the movement atomically increments `productStock.quantity` in the same transaction. No edit form ever sets quantity directly.

**POS & sales** — `sales` is branch-scoped (a sale physically happens at one location). Line-item `name`/`unitPrice` are snapshotted server-side at sale time from the current catalog — never trusted from the client and never a live reference back to `products`/`services` (a later price change must not retroactively alter a completed sale). Payment (`cash`/`mtn_momo`/`orange_money`) is a manually-entered record only — the system never calls out to MTN, Orange, or any payment processor to verify it. Selling a product decrements `productStock` and writes a `stockMovements` entry (`type: 'sale'`) via the same transaction discipline as every other stock change; selling a service touches no stock. `cashier` is a new, narrow role (client-SDK login path, `pos.sale.create`/`pos.sale.view` only, zero admin/inventory/supplier access anywhere).

**Voiding a sale** — full-sale void only; no partial/line-item returns, no payment reversal (the system never verified payment methods in the first place, so there's nothing on that side to undo). Voiding is additive, not destructive: the original `sales` doc's `lineItems`/`payments`/`total` are never touched — only `voidedAt`/`voidedBy`/`voidReason` are set, once, on top, and a second void attempt on an already-voided sale is rejected. Stock reversal is ledger-driven, not re-derived from `lineItems`: for each `type:'sale'` `stockMovements` entry the original sale created, a new `type:'void'` entry (positive delta, same `saleId` link) is written in the same transaction that sets the sale's voided fields — the ledger is the source of truth for what to reverse, not a re-aggregation of the sale's line items. `pos.sale.void` is `branch_manager`/`admin`/`super_admin` only, never `cashier`; a `branch_manager` may only void a sale in their own branch.

**Current status**: Phase 1 (Foundation) complete. Phase 2 (Catalog & Inventory) complete. Phase 3 (POS) complete. Phase 3.1 (Void a Sale) in progress. Open decisions not yet locked — jurisdiction/tax compliance target, payment processor(s) for POS beyond manual cash/mobile-money recording, CRM data scope, current branch count, inventory/accounting integration approach, partial/line-item returns (deliberately deferred past 3.1). Don't assume answers to these; flag if a task depends on one.
