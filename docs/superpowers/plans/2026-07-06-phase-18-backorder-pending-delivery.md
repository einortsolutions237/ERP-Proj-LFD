# Phase 18 — Backorder & Pending Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `POST /api/sales` complete a sale even when a product line's requested quantity exceeds available stock, tracking the shortfall as a `pendingDeliveries` record instead of rejecting the transaction — the online-first half of offline-capable POS, proven safe before Phase 18.1 builds the actual offline queue on top of it.

**Architecture:** One new collection, `pendingDeliveries` (one doc per backordered product line per sale), fully closed in Firestore rules like every clinical-adjacent collection before it. The core change lives entirely inside `api/sales/route.ts`'s existing transaction — where the current code throws a 409 on any line exceeding stock, it now computes the actual quantity available, decrements stock to exactly zero for that line, records the true (not requested) quantity in `stockMovements`, and writes a `pendingDeliveries` doc for the difference. A sale that would produce a backorder with no customer attached is still rejected (this is the one new rejection path). A new `pos.delivery.fulfill` capability (not `admin`, per Phase 17's narrowing) gates both viewing and fulfilling deliveries; fulfillment is a small transaction-guarded status flip, following the exact template `POST /api/lab-results` and `POST /api/sales/[id]/void` already established. A Cloud Function trigger notifies the branch's `branch_manager`, following the `onAppointmentScheduled`/`onLabResultEntered` template exactly. The customer detail page gets a fifth section, "Pending deliveries," under the same "do not touch the rest of the file" standard every phase since Phase 9 has held to.

**Tech Stack:** Same as the rest of the app — Next.js Server Components + API routes, Firebase Admin SDK, Firestore, Cloud Functions v2. No unit test suite in this project (confirmed convention through Phases 13–17) — verification per task is `npx tsc --noEmit` clean plus confirming imported signatures against live source; the phase closes with live verification against real `erp-lfd` data, gated on the user's explicit go-ahead, with extra scrutiny on Task 2 since it modifies `api/sales/route.ts`'s core transaction for the first time since Phase 3.

## Global Constraints

- Full-quantity fulfillment only — no partial fulfillment of a `pendingDeliveries` record in this phase. That is Phase 18.1 (or later) territory, not this one.
- No offline queue, no lost-connection detection/handling of any kind — this phase runs entirely online. Phase 18.1 builds that on top of what this phase proves safe.
- A sale with no backorder must behave byte-for-byte as it did before this phase — this is the regression check that matters most, given what file is being touched.
- `pendingDeliveries` is fully closed in Firestore rules (`allow read, write: if false`) — same treatment as `treatments`/`appointments`/`labOrders`/`labResults`/`seminars`/`seminarAttendance`, since every access path in this phase is server-side (API route or Server Component helper), never a direct client SDK read.
- `pos.delivery.fulfill` is `cashier`/`branch_manager`/`general_manager`/`super_admin` — **not `admin`**, consistent with Phase 17's narrowing.
- The customer detail page's four existing sections (Purchase History, Clinical record, Upcoming appointments, Lab orders) must be provably unchanged — diffed against the pre-phase version, same standard every phase since Phase 9 has been held to.
- Task 0 (confirming the repo's `CLAUDE.md` matches what the phase prompt expects) was already completed in conversation before this plan was written — no separate task for it here.

## Decisions requiring your sign-off before implementation

### 1. Rejection status code for "backorder with no customer attached": `409`, not `400`

The behavior this replaces (insufficient stock outright rejecting the sale) was a `409` — a state conflict, not malformed input. The new check is the same shape: the request is well-formed, but current stock levels combined with a missing `customerId` make it impossible to honor. Using `409` keeps that semantic consistent rather than introducing `400` for what is still fundamentally a conflict with current state.

**Resolved as above unless you object.**

### 2. No separate `pos.delivery.view` capability

The brief says fulfilling and viewing pending deliveries share the same role group verbatim ("Same group for viewing the pending-deliveries list"). One capability, `pos.delivery.fulfill`, gates both — matching how `clinical.lab.manage` alone (not a separate view capability) never existed for lab *ordering*, while view and manage are genuinely split elsewhere only where the brief calls for asymmetric access. Here it doesn't.

**Resolved as above unless you object.**

### 3. `isBranchLocked()` decides branch scoping for both the list query and the fulfill check

Rather than hardcoding a role check the way `void`'s `branch_manager`-own-branch restriction did (built before `isBranchLocked` existed), this plan uses the established helper: a branch-locked viewer (`cashier`, `branch_manager`) only sees/fulfills their own branch's pending deliveries; a non-branch-locked viewer (`general_manager`, `super_admin`) sees/fulfills org-wide. This is CLAUDE.md's own stated preference ("Any new route creating a branch-scoped record should use `isBranchLocked` rather than re-deriving the role list") applied to a genuinely new case, not a repeat of the debated `GET /api/sales` pattern.

**Resolved as above unless you object.**

### 4. Viewing pending deliveries is not separately audit-logged

Unlike `appointment_view`/`lab_view`/`seminar_attendance_view` (all clinical or clinical-adjacent, hence privacy-sensitive), pending deliveries are stock/sales-adjacent operational data — the same category as `sales`/`stockMovements`, neither of which has its own "_view" audit action. Only the state-changing write (fulfillment) gets an audit entry, `pending_delivery_fulfilled`.

**Resolved as above unless you object.**

### 5. No standalone `/pending-deliveries` list page or `GET /api/pending-deliveries` route

The brief only asks for a customer-detail-page section. A dedicated cross-customer list (e.g. "everything my branch owes right now") might be genuinely useful operationally, but isn't named in the brief's exit criteria — building it now would be scope creep this project's own conventions explicitly warn against. Flagging in case you'd rather have it now than as a follow-up.

**Resolved as above unless you object — say so if you want a standalone list view added to this phase.**

### 6. No changes to `CheckoutForm.tsx` or the sale receipt page (`/pos/sales/[id]`)

The cashier isn't shown "this line was backordered, tell the customer" at the moment of sale or on the receipt — the only new visible surface this phase builds is the customer detail page's new section. The brief's own behavior description implies the cashier needs to know a promise was made, but the exit criteria don't list any checkout/receipt UI, so it's left out by default rather than added speculatively.

**Resolved as above unless you object — say so if you want a minimal "N item(s) backordered" notice added to the receipt page or post-checkout screen.**

### 7. `pendingDeliveries` becomes the sixth check in `DELETE /api/customers/[id]`'s dependent-collection guard, added in this phase

This phase doesn't otherwise touch `api/customers/[id]/route.ts`, so under CLAUDE.md's own Known-issues policy the strictly-correct move would be to just re-flag this rather than fix it (the policy's rule: fix only what the phase's own work already touches). But `docs/tech-debt.md`'s TD-3 note explicitly names "a sixth dependent collection" as the trigger for revisiting whether the allowlist-of-collections shape should become soft-delete/archive — and `pendingDeliveries` is exactly that sixth collection, introduced by this phase itself. Task 7 adds the mechanical check (matching the `labOrders`/`seminarAttendance` precedent exactly) and updates TD-3's note to record that the named trigger point has now arrived — without attempting to resolve the soft-delete/archive question itself, which `tech-debt.md` is explicit should be a deliberate decision, not a byproduct of whichever phase happens to add the next check.

**Resolved as above unless you object — say so if you'd rather leave `DELETE /api/customers/[id]` untouched this phase and only re-flag in tech-debt.md.**

### 8. Notification recipient is `branch_manager` only, not `admin`/`general_manager`/`super_admin`

The brief says "notifying `branch_manager` at that branch," matching `onAppointmentScheduled`'s single-recipient-role shape rather than `onLowStock`'s broader `branch_manager` + org-admin fan-out. If a branch has no assigned `branch_manager`, the trigger silently no-ops — same empty-recipient handling `onLowStock` already established, not a new pattern.

**Resolved as above unless you object.**

---

## Task 1: Data model, permissions, audit action, Firestore rules, indexes

**Review tier: Opus** (capability grant, matching this project's unwavering practice — every capability-grant task has been Opus-reviewed: Phase 13's Task 1, Phase 13.1's only task, Phase 14's Task 1, Phase 15's Task 1, Phase 16's Task 1).

**Files:**
- Create: `src/lib/types/pendingDelivery.ts`
- Modify: `src/lib/auth/permissions.ts`
- Modify: `src/lib/types/audit.ts`
- Modify: `src/lib/types/notification.ts`
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Produces: `PendingDelivery`, `PendingDeliveryStatus` types. `Capability` now includes `'pos.delivery.fulfill'`. `AuditAction` now includes `'pending_delivery_fulfilled'`. `NotificationType` now includes `'pending_delivery'`.

- [ ] **Step 1: Create the `PendingDelivery` type**

Create `src/lib/types/pendingDelivery.ts`:

```ts
export type PendingDeliveryStatus = 'pending' | 'fulfilled'

export interface PendingDelivery {
  id: string
  saleId: string
  productId: string
  customerId: string
  branchId: string
  quantityOwed: number
  status: PendingDeliveryStatus
  fulfilledBy: string | null
  fulfilledAt: FirebaseFirestore.Timestamp | null
  createdAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 2: Add the new capability to the `Capability` union and `CAPABILITY_MODULE`**

In `src/lib/auth/permissions.ts`, change:

```ts
  | 'seminars.manage'
  | 'seminars.attendance.record' | 'seminars.attendance.view'
  // accounting.* — no capabilities defined yet;
  // add them here when the module is actually built.
```

to:

```ts
  | 'seminars.manage'
  | 'seminars.attendance.record' | 'seminars.attendance.view'
  | 'pos.delivery.fulfill'
  // accounting.* — no capabilities defined yet;
  // add them here when the module is actually built.
```

and change:

```ts
  'seminars.manage': 'seminars',
  'seminars.attendance.record': 'seminars',
  'seminars.attendance.view': 'seminars',
}
```

to:

```ts
  'seminars.manage': 'seminars',
  'seminars.attendance.record': 'seminars',
  'seminars.attendance.view': 'seminars',
  'pos.delivery.fulfill': 'pos',
}
```

- [ ] **Step 3: Add the `POS_DELIVERY_FULFILL_ROLES` constant and wire it into `ROLE_CAPABILITIES`**

In `src/lib/auth/permissions.ts`, immediately after the `SEMINAR_VIEW_ROLES` constant, add:

```ts
// Backs pos.delivery.fulfill — fulfilling (or viewing) a pending delivery
// is deliberately low-trust/operational, same reasoning as why cashier
// never needed void-level scrutiny for this kind of confirmation: there's
// no way to profit from falsely marking a delivery fulfilled. admin is
// deliberately absent, consistent with Phase 17's narrowing — this is
// exactly the capability that would have needed a retrofit had Phase 18
// shipped before Phase 17's roles restructuring.
const POS_DELIVERY_FULFILL_ROLES: RoleId[] = ['super_admin', 'general_manager', 'branch_manager', 'cashier']
```

Then change the end of `ROLE_CAPABILITIES` from:

```ts
  'seminars.manage': SEMINAR_MANAGE_ROLES,
  'seminars.attendance.record': SEMINAR_RECORD_ROLES,
  'seminars.attendance.view': SEMINAR_VIEW_ROLES,
}
```

to:

```ts
  'seminars.manage': SEMINAR_MANAGE_ROLES,
  'seminars.attendance.record': SEMINAR_RECORD_ROLES,
  'seminars.attendance.view': SEMINAR_VIEW_ROLES,
  'pos.delivery.fulfill': POS_DELIVERY_FULFILL_ROLES,
}
```

- [ ] **Step 4: Add the new audit action**

In `src/lib/types/audit.ts`, change:

```ts
  | 'seminar_create' | 'seminar_edit' | 'seminar_attendance_record' | 'seminar_attendance_view'
```

to:

```ts
  | 'seminar_create' | 'seminar_edit' | 'seminar_attendance_record' | 'seminar_attendance_view'
  | 'pending_delivery_fulfilled'
```

- [ ] **Step 5: Add the new notification type**

In `src/lib/types/notification.ts`, change:

```ts
export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed' | 'appointment_scheduled' | 'lab_result_entered'
```

to:

```ts
export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed' | 'appointment_scheduled' | 'lab_result_entered' | 'pending_delivery'
```

- [ ] **Step 6: Close `pendingDeliveries` in Firestore rules**

In `firestore.rules`, immediately after the `seminarAttendance` match block and before the final catch-all `match /{document=**}`, add:

```
    match /pendingDeliveries/{deliveryId} {
      allow read, write: if false; // all access goes through /api/sales (create, inside the sale transaction) and /api/pending-deliveries/[id]/fulfill — stock/sales-adjacent operational data, same fully-closed treatment as treatments/appointments/labOrders/seminars
    }
```

- [ ] **Step 7: Add composite indexes for `pendingDeliveries`**

In `firestore.indexes.json`, immediately before the closing `],` of the `"indexes"` array (after the last `seminarAttendance` entry), add:

```json
    {
      "collectionGroup": "pendingDeliveries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "customerId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "pendingDeliveries",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "customerId", "order": "ASCENDING" },
        { "fieldPath": "branchId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
```

(Don't forget the trailing comma after the previous `seminarAttendance` entry's closing `}`.)

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors. `NotificationBell.tsx`'s `NOTIFICATION_LINKS: Record<NotificationType, ...>` will now error ("property 'pending_delivery' is missing") until Task 5 adds it — confirm the *only* new error is that one missing property, nothing else.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types/pendingDelivery.ts src/lib/auth/permissions.ts src/lib/types/audit.ts src/lib/types/notification.ts firestore.rules firestore.indexes.json
git commit -m "feat(pos): add pendingDeliveries type, pos.delivery.fulfill capability, rules, indexes"
```

---

## Task 2: `api/sales/route.ts` — the core backorder transaction change

**Review tier: Opus** (the first modification to this transaction's actual logic since Phase 3 built it — treat with the highest scrutiny this project applies to any change, per the phase brief's own explicit instruction).

**Files:**
- Modify: `src/app/api/sales/route.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (this task can technically run before Task 1, but keep it sequential — Task 1's `pendingDeliveries` rules/indexes should exist before this task's transaction starts writing to that collection, even though the Admin SDK bypasses rules entirely).
- Produces: `POST /api/sales` now writes `pendingDeliveries` docs for backordered lines. Nothing about the response shape (`{ id, subtotal, total }`) changes.

**Only this exact diff changes in the file — nothing else. The `GET` handler, all validation before the stock-read block, and the audit log call's shape (aside from one new field in `details`) are untouched.**

- [ ] **Step 1: Replace the stock-check block with the backorder computation**

Current code (inside the transaction, after the stock snapshots are read):

```ts
        for (const pl of normalized.productLines) {
          const currentQuantity = (stockSnaps.get(pl.itemId)!.data()?.quantity as number | undefined) ?? 0
          if (currentQuantity - pl.quantity < 0) {
            const name = itemSnaps.get(pl.itemId)!.data()!.name as string
            throw new AuthError(`Insufficient stock for ${name}`, 409)
          }
        }
```

Replace with:

```ts
        const quantityTakenMap = new Map<string, number>()
        const backorders: { itemId: string; name: string; quantityTaken: number; quantityOwed: number }[] = []
        for (const pl of normalized.productLines) {
          const currentQuantity = (stockSnaps.get(pl.itemId)!.data()?.quantity as number | undefined) ?? 0
          const quantityTaken = Math.min(currentQuantity, pl.quantity)
          quantityTakenMap.set(pl.itemId, quantityTaken)
          const quantityOwed = pl.quantity - quantityTaken
          if (quantityOwed > 0) {
            const name = itemSnaps.get(pl.itemId)!.data()!.name as string
            backorders.push({ itemId: pl.itemId, name, quantityTaken, quantityOwed })
          }
        }

        if (backorders.length > 0 && !customerId) {
          throw new AuthError('A sale with a backordered item must have a customer attached', 409)
        }
```

- [ ] **Step 2: Replace the stock/movement write loop and add the `pendingDeliveries` writes**

Current code (inside the `// ---- WRITES ----` section, after the `saleRef` set):

```ts
        for (const pl of normalized.productLines) {
          tx.set(
            stockRefs.get(pl.itemId)!,
            { branchId: user.branchId, productId: pl.itemId, quantity: FieldValue.increment(-pl.quantity), updatedAt: new Date() },
            { merge: true }
          )
          tx.set(movementRefs.get(pl.itemId)!, {
            productId: pl.itemId,
            branchId: user.branchId,
            type: 'sale',
            quantityDelta: -pl.quantity,
            reason: null,
            actorUid: user.uid,
            createdAt: new Date(),
            transferId: null,
            saleId: saleRef.id,
          })
        }

        return { resolvedLineItems, subtotal, total }
```

Replace with:

```ts
        for (const pl of normalized.productLines) {
          const quantityTaken = quantityTakenMap.get(pl.itemId)!
          tx.set(
            stockRefs.get(pl.itemId)!,
            { branchId: user.branchId, productId: pl.itemId, quantity: FieldValue.increment(-quantityTaken), updatedAt: new Date() },
            { merge: true }
          )
          tx.set(movementRefs.get(pl.itemId)!, {
            productId: pl.itemId,
            branchId: user.branchId,
            type: 'sale',
            quantityDelta: -quantityTaken,
            reason: null,
            actorUid: user.uid,
            createdAt: new Date(),
            transferId: null,
            saleId: saleRef.id,
          })
        }

        const pendingDeliveryRefs = new Map(backorders.map((b) => [b.itemId, db.collection('pendingDeliveries').doc()] as const))
        for (const b of backorders) {
          tx.set(pendingDeliveryRefs.get(b.itemId)!, {
            saleId: saleRef.id,
            productId: b.itemId,
            customerId: customerId as string,
            branchId: user.branchId,
            quantityOwed: b.quantityOwed,
            status: 'pending',
            fulfilledBy: null,
            fulfilledAt: null,
            createdAt: new Date(),
          })
        }

        return { resolvedLineItems, subtotal, total, backorders }
```

- [ ] **Step 3: Update the `committed` type declaration to carry `backorders`**

Current code:

```ts
    let committed: { resolvedLineItems: SaleLineItem[]; subtotal: number; total: number }
```

Replace with:

```ts
    let committed: {
      resolvedLineItems: SaleLineItem[]
      subtotal: number
      total: number
      backorders: { itemId: string; name: string; quantityTaken: number; quantityOwed: number }[]
    }
```

- [ ] **Step 4: Include `backorders` in the audit log's `details`**

Current code:

```ts
    await writeAuditLog({
      action: 'sale_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: saleRef.id,
      branchId: user.branchId,
      details: {
        lineItems: committed.resolvedLineItems,
        subtotal: committed.subtotal,
        discountAmount,
        taxAmount: 0,
        total: committed.total,
        payments,
        customerId,
      },
    })
```

Replace with:

```ts
    await writeAuditLog({
      action: 'sale_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: saleRef.id,
      branchId: user.branchId,
      details: {
        lineItems: committed.resolvedLineItems,
        subtotal: committed.subtotal,
        discountAmount,
        taxAmount: 0,
        total: committed.total,
        payments,
        customerId,
        backorders: committed.backorders,
      },
    })
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/app/api/sales/route.ts`.

- [ ] **Step 6: Verify the untouched parts of the file are actually untouched**

Run: `git diff src/app/api/sales/route.ts`
Expected: the diff touches exactly the four blocks above (the stock-check replacement, the write-loop replacement plus new `pendingDeliveries` loop, the `committed` type, and the audit log `details`). The `GET` handler, every validation block before the stock-read, `normalizeCartLines`/`movementRefs` setup, and the `try { ... } catch` wrapper structure are byte-identical to before.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/sales/route.ts
git commit -m "feat(pos): allow sales to complete on insufficient stock, tracking shortfall as a pending delivery"
```

---

## Task 3: `getPendingDeliveries` helper

**Review tier: Sonnet** (no transaction here — a plain read plus name-lookup fan-out, the same non-transactional shape as `getAppointments`/`getLabRecords`; the one transaction-guarded write in this phase lives in Task 4).

**Files:**
- Create: `src/lib/pos/getPendingDeliveries.ts`

**Interfaces:**
- Consumes: `PendingDelivery`/`PendingDeliveryStatus` (Task 1), `hasCapability`/`isBranchLocked` (`src/lib/auth/permissions.ts`), `SessionUser`/`AuthError` (`src/lib/auth/server-guard.ts`), `getAdminFirestore` (`src/lib/firebase/admin`).
- Produces: `PendingDeliveryRow` type and `getPendingDeliveries(customerId: string, viewer: SessionUser): Promise<PendingDeliveryRow[]>`, consumed by Task 6's customer detail page section.

- [ ] **Step 1: Create the helper**

Create `src/lib/pos/getPendingDeliveries.ts`:

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { PendingDelivery, PendingDeliveryStatus } from '@/lib/types/pendingDelivery'

export interface PendingDeliveryRow {
  id: string
  saleId: string
  productId: string
  productName: string
  quantityOwed: number
  status: PendingDeliveryStatus
  fulfilledByName: string | null
  fulfilledAt: string | null
  createdAt: string
}

// Called by the customer detail page's "Pending deliveries" section — same
// direct-in-process pattern as getAppointments/getLabRecords, except this
// data is stock/sales-adjacent (operational), not clinical, so unlike its
// two precedents it does NOT write its own audit log entry: viewing sales/
// stock movements isn't separately audited anywhere else in this app either
// (see Decision #4 in this phase's plan). Re-checks the capability itself
// rather than trusting the caller already did, same belt-and-suspenders
// discipline as getAppointments/getLabRecords.
export async function getPendingDeliveries(customerId: string, viewer: SessionUser): Promise<PendingDeliveryRow[]> {
  if (!hasCapability(viewer.role, 'pos.delivery.fulfill')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('pendingDeliveries').where('customerId', '==', customerId)
  if (isBranchLocked(viewer.role)) {
    query = query.where('branchId', '==', viewer.branchId)
  }
  query = query.orderBy('createdAt', 'desc')
  const snap = await query.get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as PendingDelivery }))
  const uniqueProductIds = Array.from(new Set(docs.map((d) => d.data.productId)))
  const uniqueFulfilledByUids = Array.from(
    new Set(docs.map((d) => d.data.fulfilledBy).filter((uid): uid is string => uid !== null))
  )
  const [productDocs, staffDocs] = await Promise.all([
    Promise.all(uniqueProductIds.map((id) => db.collection('products').doc(id).get())),
    Promise.all(uniqueFulfilledByUids.map((uid) => db.collection('staff').doc(uid).get())),
  ])
  const productNames: Record<string, string> = {}
  uniqueProductIds.forEach((id, i) => {
    productNames[id] = (productDocs[i].data()?.name as string | undefined) ?? id
  })
  const staffNames: Record<string, string> = {}
  uniqueFulfilledByUids.forEach((uid, i) => {
    staffNames[uid] = (staffDocs[i].data()?.name as string | undefined) ?? uid
  })

  return docs.map(({ id, data }) => ({
    id,
    saleId: data.saleId,
    productId: data.productId,
    productName: productNames[data.productId] ?? data.productId,
    quantityOwed: data.quantityOwed,
    status: data.status,
    fulfilledByName: data.fulfilledBy ? (staffNames[data.fulfilledBy] ?? data.fulfilledBy) : null,
    fulfilledAt: data.fulfilledAt ? data.fulfilledAt.toDate().toISOString() : null,
    createdAt: data.createdAt.toDate().toISOString(),
  }))
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pos/getPendingDeliveries.ts
git commit -m "feat(pos): add getPendingDeliveries helper"
```

---

## Task 4: Fulfill endpoint

**Review tier: Opus** (the one transaction-guarded write in this phase — the atomic status flip plus the "no double-fulfillment" invariant it protects, matching Phase 15's Opus-tier treatment of the structurally identical lab-result-entry transaction).

**Files:**
- Create: `src/app/api/pending-deliveries/[id]/fulfill/route.ts`

**Interfaces:**
- Consumes: `PendingDelivery` (Task 1), `isBranchLocked` (`src/lib/auth/permissions.ts`), `requireCapability`/`AuthError` (`src/lib/auth/server-guard.ts`), `writeAuditLog` (`src/lib/audit/log.ts`).
- Produces: `POST /api/pending-deliveries/[id]/fulfill`, consumed by Task 6's fulfill button.

- [ ] **Step 1: Create the route**

Create `src/app/api/pending-deliveries/[id]/fulfill/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import { writeAuditLog } from '@/lib/audit/log'
import type { PendingDelivery } from '@/lib/types/pendingDelivery'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('pos.delivery.fulfill')

    const db = getAdminFirestore()
    const deliveryRef = db.collection('pendingDeliveries').doc(id)

    let delivery: PendingDelivery

    try {
      delivery = await db.runTransaction(async (tx) => {
        const snap = await tx.get(deliveryRef)
        if (!snap.exists) {
          throw new AuthError('Pending delivery not found', 404)
        }
        const data = snap.data() as PendingDelivery

        if (isBranchLocked(user.role) && data.branchId !== user.branchId) {
          throw new AuthError('Can only fulfill pending deliveries for your own branch', 403)
        }
        if (data.status === 'fulfilled') {
          throw new AuthError('This delivery has already been fulfilled', 409)
        }

        tx.update(deliveryRef, {
          status: 'fulfilled',
          fulfilledBy: user.uid,
          fulfilledAt: new Date(),
        })

        return { ...data, id: snap.id }
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'pending_delivery_fulfilled',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: delivery.customerId,
      branchId: delivery.branchId,
      details: { saleId: delivery.saleId, productId: delivery.productId, quantityOwed: delivery.quantityOwed },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/pending-deliveries/[id]/fulfill/route.ts"
git commit -m "feat(pos): add pending-delivery fulfill endpoint, transaction-guarded against double-fulfillment"
```

---

## Task 5: Cloud Function notification trigger

**Review tier: Sonnet** (mechanical repetition of the already-proven `onAppointmentScheduled`/`onLabResultEntered` template).

**Files:**
- Create: `functions/src/pendingDeliveryNotifications.ts`
- Modify: `functions/src/index.ts`
- Modify: `src/components/notifications/NotificationBell.tsx`

**Interfaces:**
- Produces: `onPendingDeliveryCreated`, exported from `functions/src/index.ts`. `NOTIFICATION_LINKS` now has a `pending_delivery` entry, closing the `Record<NotificationType, ...>` gap Task 1 introduced.

- [ ] **Step 1: Create the trigger**

Create `functions/src/pendingDeliveryNotifications.ts`:

```ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

export const onPendingDeliveryCreated = onDocumentCreated(
  { document: 'pendingDeliveries/{deliveryId}', database: 'default' },
  async (event) => {
    const delivery = event.data?.data()
    if (!delivery) return

    const { productId, branchId, customerId, quantityOwed } = delivery as {
      productId: string
      branchId: string
      customerId: string
      quantityOwed: number
    }

    const db = getFunctionsFirestore()
    const [productSnap, customerSnap, branchManagersSnap] = await Promise.all([
      db.collection('products').doc(productId).get(),
      db.collection('customers').doc(customerId).get(),
      db.collection('staff').where('role', '==', 'branch_manager').where('branchId', '==', branchId).get(),
    ])
    // No branch_manager assigned to this branch — nothing to notify.
    // Doesn't error or commit a no-op batch, same handling as onLowStock.
    if (branchManagersSnap.empty) return

    const productName = productSnap.exists ? (productSnap.data()!.name as string) : productId
    const customerName = customerSnap.exists ? (customerSnap.data()!.name as string) : customerId
    const deliveryId = event.params.deliveryId

    const batch = db.batch()
    for (const managerDoc of branchManagersSnap.docs) {
      const notifRef = db.collection('notifications').doc(`pending_delivery_${deliveryId}_${managerDoc.id}`)
      batch.create(notifRef, {
        recipientUid: managerDoc.id,
        type: 'pending_delivery',
        title: 'New pending delivery',
        body: `${quantityOwed} unit(s) of ${productName} owed to ${customerName}.`,
        relatedId: customerId,
        read: false,
        createdAt: new Date(),
      })
    }
    try {
      await batch.commit()
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
```

- [ ] **Step 2: Export the trigger**

In `functions/src/index.ts`, change:

```ts
export { onLowStock } from './lowStock'
export { onLeaveRequestSubmitted, onLeaveRequestReviewed } from './leaveNotifications'
export { onAppointmentScheduled } from './appointmentNotifications'
export { onLabResultEntered } from './labResultNotifications'
```

to:

```ts
export { onLowStock } from './lowStock'
export { onLeaveRequestSubmitted, onLeaveRequestReviewed } from './leaveNotifications'
export { onAppointmentScheduled } from './appointmentNotifications'
export { onLabResultEntered } from './labResultNotifications'
export { onPendingDeliveryCreated } from './pendingDeliveryNotifications'
```

- [ ] **Step 3: Close the `NOTIFICATION_LINKS` gap Task 1 introduced**

In `src/components/notifications/NotificationBell.tsx`, change:

```ts
const NOTIFICATION_LINKS: Record<NotificationType, (relatedId: string) => string> = {
  low_stock: (relatedId) => `/products/${relatedId}`,
  leave_request_submitted: () => '/leave/review',
  leave_request_reviewed: () => '/leave',
  appointment_scheduled: () => '/appointments',
  lab_result_entered: (relatedId) => `/customers/${relatedId}`,
}
```

to:

```ts
const NOTIFICATION_LINKS: Record<NotificationType, (relatedId: string) => string> = {
  low_stock: (relatedId) => `/products/${relatedId}`,
  leave_request_submitted: () => '/leave/review',
  leave_request_reviewed: () => '/leave',
  appointment_scheduled: () => '/appointments',
  lab_result_entered: (relatedId) => `/customers/${relatedId}`,
  pending_delivery: (relatedId) => `/customers/${relatedId}`,
}
```

(`relatedId` is set to `customerId` in Task 5 Step 1's trigger, matching `lab_result_entered`'s exact convention, so the branch manager lands directly on the customer whose delivery is owed.)

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit` (root project) and `cd functions && npx tsc --noEmit` (functions package, separate `tsconfig`).
Expected: no new errors in either.

- [ ] **Step 5: Commit**

```bash
git add functions/src/pendingDeliveryNotifications.ts functions/src/index.ts src/components/notifications/NotificationBell.tsx
git commit -m "feat(pos): notify branch_manager on new pending delivery via Cloud Function trigger"
```

---

## Task 6: Customer detail page — "Pending deliveries" section

**Review tier: Sonnet**, but the diff review must explicitly confirm the "do not touch" list below — same standard as Phase 14's Task 7 / Phase 15's Task 6 / Phase 16's Task 6.

**Files:**
- Create: `src/components/pos/PendingDeliveriesSection.tsx`
- Modify: `src/app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `PendingDeliveryRow` / `getPendingDeliveries` (Task 3), `hasCapability` (already imported in the page).
- Produces: `PendingDeliveriesSection` component, rendered from the customer detail page.

- [ ] **Step 1: Create the section component**

Create `src/components/pos/PendingDeliveriesSection.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PendingDeliveryRow } from '@/lib/pos/getPendingDeliveries'

export interface PendingDeliveriesSectionProps {
  deliveries: PendingDeliveryRow[]
}

export default function PendingDeliveriesSection({ deliveries }: PendingDeliveriesSectionProps) {
  const router = useRouter()
  const [fulfillingId, setFulfillingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFulfill(id: string) {
    setError(null)
    setFulfillingId(id)
    try {
      const res = await fetch(`/api/pending-deliveries/${id}/fulfill`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not mark this delivery as fulfilled — check your connection and try again.')
        return
      }
      router.refresh()
    } finally {
      setFulfillingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-ink">Pending deliveries</h2>
      {deliveries.length === 0 ? (
        <p className="text-sm text-slate">No pending deliveries.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-mist">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Qty owed</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-mist/40 transition-colors">
                  <td className="px-3 py-2 text-ink">{d.productName}</td>
                  <td className="px-3 py-2 font-mono text-ink">{d.quantityOwed}</td>
                  <td className="px-3 py-2 text-ink">
                    {d.status === 'fulfilled'
                      ? `Fulfilled${d.fulfilledByName ? ` by ${d.fulfilledByName}` : ''}${d.fulfilledAt ? ` on ${new Date(d.fulfilledAt).toLocaleString()}` : ''}`
                      : 'Pending'}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    {d.status === 'pending' && (
                      <button
                        type="button"
                        disabled={fulfillingId === d.id}
                        onClick={() => handleFulfill(d.id)}
                        className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist disabled:opacity-50"
                      >
                        Mark fulfilled
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the customer detail page**

In `src/app/(dashboard)/customers/[id]/page.tsx`, change the import block from:

```ts
import ClinicalSection from '@/components/clinical/ClinicalSection'
import LabSection from '@/components/clinical/LabSection'
import type { Customer } from '@/lib/types/customer'
import type { Sale } from '@/lib/types/sale'
```

to:

```ts
import ClinicalSection from '@/components/clinical/ClinicalSection'
import LabSection from '@/components/clinical/LabSection'
import PendingDeliveriesSection from '@/components/pos/PendingDeliveriesSection'
import { getPendingDeliveries } from '@/lib/pos/getPendingDeliveries'
import type { Customer } from '@/lib/types/customer'
import type { Sale } from '@/lib/types/sale'
```

Change:

```ts
  const canViewSeminarAttendance = hasCapability(user.role, 'seminars.attendance.view')
  const seminarAttendance = canViewSeminarAttendance
    ? await getSeminarAttendance({ customerId: id }, user)
    : []
```

to:

```ts
  const canViewSeminarAttendance = hasCapability(user.role, 'seminars.attendance.view')
  const seminarAttendance = canViewSeminarAttendance
    ? await getSeminarAttendance({ customerId: id }, user)
    : []
  const canFulfillDeliveries = hasCapability(user.role, 'pos.delivery.fulfill')
  const pendingDeliveries = canFulfillDeliveries
    ? await getPendingDeliveries(id, user)
    : []
```

Change:

```tsx
      {canViewLab && (
        <LabSection customerId={id} orders={labOrders} canManage={canManageLab} />
      )}
    </div>
  )
}
```

to:

```tsx
      {canViewLab && (
        <LabSection customerId={id} orders={labOrders} canManage={canManageLab} />
      )}

      {canFulfillDeliveries && (
        <PendingDeliveriesSection deliveries={pendingDeliveries} />
      )}
    </div>
  )
}
```

No change to the page's top-level `requireAnyCapability(['crm.customer.view', 'clinical.record.view', 'seminars.attendance.view'])` guard — verified all four `pos.delivery.fulfill` roles already pass it independently: `cashier`/`branch_manager` via `crm.customer.view` (`CRM_VIEW_ROLES`), `general_manager` via `clinical.record.view` (`CLINICAL_VIEW_ROLES`), `super_admin` via all three. Unlike Phase 16's `protocol` gap, there is no new reachability hole to fix here — confirm this by re-checking `CRM_VIEW_ROLES`/`CLINICAL_VIEW_ROLES` directly, not by assuming it from this note.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Verify the four existing sections are untouched**

Run: `git diff "src/app/(dashboard)/customers/[id]/page.tsx"`
Expected: the only hunks touch the import block, the two new lines computing `canFulfillDeliveries`/`pendingDeliveries`, and the new `PendingDeliveriesSection` block appended after `LabSection` — nothing in the Purchase History, `ClinicalSection` invocation, Upcoming appointments, or `LabSection` invocation blocks appears in the diff.

- [ ] **Step 5: Commit**

```bash
git add src/components/pos/PendingDeliveriesSection.tsx "src/app/(dashboard)/customers/[id]/page.tsx"
git commit -m "feat(pos): add Pending deliveries section to customer detail page"
```

---

## Task 7: TD-3's sixth check — `pendingDeliveries`

**Review tier: Sonnet** (mechanical repetition of the already-proven `labOrders`/`seminarAttendance` check pattern).

**Files:**
- Modify: `src/app/api/customers/[id]/route.ts`
- Modify: `docs/tech-debt.md`

- [ ] **Step 1: Add the sixth existence check to `DELETE`**

In `src/app/api/customers/[id]/route.ts`, immediately after the existing `seminarAttendance` check and before `await docRef.delete()`:

```ts
    const seminarAttendanceSnap = await db.collection('seminarAttendance').where('customerId', '==', id).limit(1).get()
    if (!seminarAttendanceSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a seminar attendance record' }, { status: 409 })
    }
```

add:

```ts
    const pendingDeliveriesSnap = await db.collection('pendingDeliveries').where('customerId', '==', id).limit(1).get()
    if (!pendingDeliveriesSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a pending delivery' }, { status: 409 })
    }
```

Nothing else in this file changes — the `PATCH` handler above `DELETE` is untouched. `DeleteCustomerButton.tsx` already surfaces any non-2xx response's `error` message generically — no UI change needed for this task.

- [ ] **Step 2: Update TD-3's note in `docs/tech-debt.md`**

Append to the end of TD-3's existing note (after its "Constraints for the fix" paragraph):

```markdown

**Sixth collection arrived, Phase 18 (2026-07-06):** `pendingDeliveries` (introduced by Phase 18's backorder/pending-delivery model) is now the sixth independently-checked collection in this guard, added in the same phase that introduced it — matching the precedent Phase 16 set for `seminarAttendance`. This is the exact trigger point this note named as "worth deciding before a sixth dependent collection arrives" — the soft-delete/archive question itself remains genuinely unresolved and out of scope for Phase 18, per this note's own constraint that the decision be deliberate, not a byproduct of whichever phase happens to add the next check.
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/customers/[id]/route.ts" docs/tech-debt.md
git commit -m "fix(crm): extend TD-3 customer-deletion guard to pendingDeliveries (sixth check)"
```

---

## Execution

Seven tasks, in order (1 → 2 → 3 → 4 → 5 → 6 → 7 — each depends on the previous; Task 7 has no real dependency on Tasks 3–6 and could run any time after Task 1, but keep it sequential unless you're confident in the parallelization). **Tasks 1, 2, and 4 get Opus review** (capability grant; the core transaction change explicitly called out for extra care; the transaction-guarded fulfill write). **Tasks 3, 5, 6, 7 get Sonnet-tier review**, matching this project's established practice. Final whole-branch review also on Opus, specifically re-checking:

- `POS_DELIVERY_FULFILL_ROLES` is exactly `['super_admin', 'general_manager', 'branch_manager', 'cashier']` — confirmed by direct comparison, not visual similarity, and confirmed `admin` is nowhere in it.
- A fully-in-stock sale (no line exceeds available quantity) produces byte-identical `stockMovements`/`productStock` writes to the pre-Phase-18 behavior — no `pendingDeliveries` doc created, `backorders` is an empty array in the `sale_create` audit entry.
- A sale with a backordered line and a `customerId` attached: completes with 201, `productStock.quantity` lands at exactly 0 for that line (never negative), `stockMovements.quantityDelta` reflects the actual quantity taken (not the requested quantity), and a `pendingDeliveries` doc exists with the correct `quantityOwed`.
- The identical backorder scenario with no `customerId` is rejected with 409 and the specific message, and — critically — no `pendingDeliveries`, `stockMovements`, or `sales` doc is left behind from the rejected attempt (the whole transaction rolled back).
- `pendingDeliveries` has zero client-reachable paths in `firestore.rules`.
- `GET`/fulfilling a pending delivery is 403 for every role outside `POS_DELIVERY_FULFILL_ROLES` (spot-check `admin`, `hr_admin`, `doctor`) and 200/`ok: true` for each role inside it.
- A `cashier`/`branch_manager` cannot fulfill a pending delivery belonging to a different branch (403); a `general_manager`/`super_admin` can, regardless of branch.
- Fulfilling an already-fulfilled delivery returns 409, not a silent success or a duplicate audit entry.
- `customers/[id]/page.tsx`'s diff touches only what Task 6 describes — Purchase History, Clinical record, Upcoming appointments, and Lab orders sections byte-identical to their pre-Phase-18 state.
- `DELETE /api/customers/[id]` blocks independently on each of `sales`/`treatments`/`appointments`/`labOrders`/`seminarAttendance`/`pendingDeliveries` — verify the new sixth check individually (a customer referenced by *only* a pending delivery, nothing else, still gets blocked with the pending-delivery-specific message).
- `auditLogs` shows `pending_delivery_fulfilled` written exactly once per fulfillment, with no corresponding "viewed pending deliveries" entry ever written (per Decision #4).

**Live verification** (needs the user's explicit go-ahead before writing any real data to `erp-lfd`, per this project's standing test-data policy): using existing real accounts (`cashier`/`branch_manager`/`general_manager`/`super_admin`/`admin` from prior phases), pick a real product at a real branch and note its current `productStock.quantity`; complete a normal sale for a quantity at or under that stock and confirm behavior is unchanged (stock decrements normally, no `pendingDeliveries` doc, receipt page unchanged); then complete a sale requesting more than the remaining quantity, with a real customer attached, and confirm: the sale returns 201, `productStock.quantity` is exactly 0 afterward (check via the stock page or a direct read), a `pendingDeliveries` doc exists with the correct `quantityOwed`, and the customer's detail page shows it under "Pending deliveries"; attempt the identical backorder scenario with no customer attached and confirm 409 with the specific message and that no stray docs were left in `sales`/`stockMovements`/`pendingDeliveries`; confirm `admin` gets 403 fulfilling the delivery while `cashier`/`branch_manager`/`general_manager`/`super_admin` each succeed (test cross-branch rejection for the branch-locked roles specifically); mark the delivery fulfilled and confirm the section updates to show "Fulfilled by [name] on [date]" with the button gone, and that a second `POST .../fulfill` against the same ID returns 409; confirm the assigned branch's `branch_manager` receives the Cloud Function notification (check `notifications` collection or the bell UI) linking to the correct customer; confirm `auditLogs` shows the `sale_create` entry's `details.backorders` array populated correctly and exactly one `pending_delivery_fulfilled` entry; attempt to delete a customer referenced only by a pending delivery (create a fresh test customer for this, isolating the new check per this project's established practice) and confirm it's blocked with the pending-delivery-specific message.
