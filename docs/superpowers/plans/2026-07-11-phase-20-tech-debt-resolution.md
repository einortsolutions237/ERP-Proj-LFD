# Phase 20 — Tech Debt Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three long-standing tech-debt items — `GET /api/sales`'s branch-scoping decision, TD-1 (thin audit-log detail on catalog edits/customer creation), and TD-2 (the `onLowStock` race window) — each already decided, each touching genuinely different files and risk levels.

**Architecture:** Three independent fixes to existing routes/Cloud Function, no new collections, no new capabilities, no new UI. Task 1 makes `GET /api/sales` and `pos/sales/page.tsx` match the `isBranchLocked()` pattern every other org-wide-vs-branch-locked read in this app already uses (Phase 12). Task 2 adds a `details: { before, after }` (or, for creation, the full payload) to four audit-log call sites, reusing the exact shape `stock_adjust`/`permission_change` already use — no schema change, no viewer change (confirmed: `AuditLogTable.tsx` already renders `details` generically via `JSON.stringify`). Tasks 3-4 close TD-2 in two deliberately separable halves: the write-path (add `resultingQuantity` to every `stockMovements` write in the three named files) and the read-path (`functions/src/lowStock.ts` reads the stored value instead of reconstructing it) — split so a reviewer can approve the low-risk additive write-path independently of the actual bug-fix logic in the trigger.

**Tech Stack:** Next.js App Router API routes (TypeScript, Firebase Admin SDK), one Cloud Functions v2 trigger (`functions/src/lowStock.ts`, separate npm project under `functions/`). This project has no automated test runner — every prior phase verified via `npx tsc --noEmit` (and, for `functions/`, `cd functions && npm run build`) plus live verification against real `erp-lfd` data. This plan follows that same convention.

## Global Constraints

- **No new scope beyond these three tasks.** If anything surfaces that isn't the sales-scoping fix, TD-1, or TD-2, stop and flag it as a candidate for Phase 20.1 rather than folding it in.
- **Task 1:** `isBranchLocked(user.role) ? branchFiltered : unfiltered` — exact pattern already used in `staff/page.tsx`, `departments/page.tsx`, `stock/page.tsx`, `roles/page.tsx`, and `POST`/`GET /api/staff`. `branch_manager`/`cashier` (the only two `isBranchLocked` roles that ever reach `pos.sale.view`/`pos.sale.create`) keep seeing only their own branch; everyone else sees all branches. `api/reports/sales/route.ts` (via `src/lib/reports/sales.ts:60-62`) must NOT be changed — confirmed already correct (see Task 1's own verification note).
- **Task 2:** Reuse the `details: { before, after }` shape for the three edit actions (`product_edit`/`service_edit`/`supplier_edit`) and a flat creation-payload shape for `customer_create` — matching `stock_adjust`/`sale_void`/`permission_change`'s existing pattern. Only capture fields that were actually part of the request body's whitelisted edit (not a full-document dump). No change to `AuditLogEntry`'s type shape (`details: Record<string, unknown> | null` already supports this).
- **Task 3/4 (TD-2):** Touches `api/stock/movements/route.ts`, `api/stock/transfer/route.ts`, and `api/sales/route.ts` — give this the same review rigor as every prior deliberate touch to these files (Opus-tier review, mandatory live verification, not just a diff read). `api/sales/[id]/void/route.ts` is **deliberately out of scope** — see Task 3's note for the proof that leaving it untouched does not leave the race window open for anything that matters. Adding `resultingQuantity` must not change `productStock.quantity` itself, the stock decrement logic, or sale/transfer/adjustment behavior in any observable way — it is purely an additional field on the `stockMovements` write.
- Every task's "test" step is `npx tsc --noEmit` (and, for Task 4, `cd functions && npm run build`) — there is no automated test suite in this project.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/api/sales/route.ts` | Modify (Task 1) — `GET` handler: branch-scope conditionally instead of unconditionally |
| `src/app/(dashboard)/pos/sales/page.tsx` | Modify (Task 1) — same fix, mirrors the API route |
| `src/lib/reports/sales.ts` | Verify only (Task 1) — no code change |
| `src/app/api/products/[id]/route.ts` | Modify (Task 2) — `product_edit` gains before/after `details` |
| `src/app/api/services/[id]/route.ts` | Modify (Task 2) — capture `existing` (currently missing) + `service_edit` gains before/after `details` |
| `src/app/api/suppliers/[id]/route.ts` | Modify (Task 2) — `supplier_edit` gains before/after `details` (including a nested `contact` diff) |
| `src/app/api/customers/route.ts` | Modify (Task 2) — `customer_create` gains the full creation payload as `details` |
| `src/app/api/stock/movements/route.ts` | Modify (Task 3) — add `resultingQuantity` to the movement write (value already computed locally) |
| `src/app/api/stock/transfer/route.ts` | Modify (Task 3) — add `resultingQuantity` to both the `transfer_out` and `transfer_in` movement writes (requires capturing the destination read that today is discarded) |
| `src/app/api/sales/route.ts` | Modify (Task 3, second touch) — add `resultingQuantity` to the `sale` movement write (value already computed locally) |
| `functions/src/lowStock.ts` | Modify (Task 4) — read `resultingQuantity` directly off the triggering movement when present; fall back to the existing reconstruction only for movements that predate this phase or never carry the field |

---

### Task 1: `GET /api/sales` and `pos/sales/page.tsx` branch scoping

**Files:**
- Modify: `src/app/api/sales/route.ts` (lines 27-36, the `GET` handler only — `POST` is untouched by this task)
- Modify: `src/app/(dashboard)/pos/sales/page.tsx`
- Verify only, no edit: `src/lib/reports/sales.ts`

**Interfaces:**
- Consumes: `isBranchLocked` from `@/lib/auth/permissions` (already exported, used identically by `stock/page.tsx`/`api/staff/route.ts`).
- Produces: no new exports — both call sites just change their query construction.

- [ ] **Step 1: Fix `GET /api/sales`**

In `src/app/api/sales/route.ts`, add the import and replace the `GET` handler. Change:

```typescript
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
```

to:

```typescript
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import { writeAuditLog } from '@/lib/audit/log'
```

Then change:

```typescript
export async function GET() {
  try {
    const user = await requireCapability('pos.sale.view')
    const snap = await getAdminFirestore().collection('sales').where('branchId', '==', user.branchId).get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

to:

```typescript
export async function GET() {
  try {
    const user = await requireCapability('pos.sale.view')
    const db = getAdminFirestore()
    const snap = isBranchLocked(user.role)
      ? await db.collection('sales').where('branchId', '==', user.branchId).get()
      : await db.collection('sales').get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

`POST` (the sale-creation transaction, lines 38 onward) is untouched — this task only ever reads the `GET` handler's 10 lines.

- [ ] **Step 2: Fix `pos/sales/page.tsx`**

In `src/app/(dashboard)/pos/sales/page.tsx`, change:

```typescript
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SalesTable, { type SaleRow } from '@/components/pos/SalesTable'

export default async function SalesLogPage() {
  let user
  try {
    user = await requireCapability('pos.sale.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore()
    .collection('sales')
    .where('branchId', '==', user.branchId)
    .orderBy('createdAt', 'desc')
    .get()
```

to:

```typescript
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { isBranchLocked } from '@/lib/auth/permissions'
import SalesTable, { type SaleRow } from '@/components/pos/SalesTable'

export default async function SalesLogPage() {
  let user
  try {
    user = await requireCapability('pos.sale.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const snap = isBranchLocked(user.role)
    ? await db.collection('sales').where('branchId', '==', user.branchId).orderBy('createdAt', 'desc').get()
    : await db.collection('sales').orderBy('createdAt', 'desc').get()
```

Nothing else in this file changes — the `.map()` block below stays exactly as-is. No new Firestore index is needed: the branch-locked path reuses the existing `sales(branchId, createdAt)` composite index (already deployed, confirmed in `firestore.indexes.json`), and the unfiltered path is a single-field `orderBy`, which Firestore auto-indexes.

- [ ] **Step 3: Verify `api/reports/sales/route.ts` needs no change**

Read `src/lib/reports/sales.ts:60-62`:

```typescript
  let query: FirebaseFirestore.Query = user.role === 'branch_manager'
    ? db.collection('sales').where('branchId', '==', user.branchId)
    : db.collection('sales')
```

Confirm (do not change) that this is already equivalent to `isBranchLocked(user.role) ? ... : ...` for this specific route: check `ROLE_CAPABILITIES['reports.sales.view']` in `src/lib/auth/permissions.ts` (backed by `REPORTS_ROLES = ['super_admin', 'general_manager', 'branch_manager', 'finance_admin']`) — `cashier` and `inventory_manager` (the other two `isBranchLocked` roles) are absent from `REPORTS_ROLES` entirely, so `branch_manager` is the only `isBranchLocked` role that can ever reach this route. `user.role === 'branch_manager'` and `isBranchLocked(user.role)` are therefore equivalent in this route's reachable-role set, even though the literal code differs. Record this confirmation in your task report; do not edit `src/lib/reports/sales.ts`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sales/route.ts "src/app/(dashboard)/pos/sales/page.tsx"
git commit -m "fix(sales): scope GET /api/sales and the sales log page by isBranchLocked, matching Phase 12's pattern"
```

---

### Task 2: TD-1 — audit-log before/after detail on catalog edits and customer creation

**Files:**
- Modify: `src/app/api/products/[id]/route.ts` (the `PATCH` handler only — `DELETE` is untouched)
- Modify: `src/app/api/services/[id]/route.ts` (the `PATCH` handler only — `DELETE` is untouched)
- Modify: `src/app/api/suppliers/[id]/route.ts` (the `PATCH` handler only — `DELETE` is untouched)
- Modify: `src/app/api/customers/route.ts` (the `POST` handler only — `GET` is untouched)

**Interfaces:**
- Produces: no new exports. `writeAuditLog`'s existing `details?: Record<string, unknown> | null` parameter (already supports this, no type change needed) is now populated for these four call sites.

- [ ] **Step 1: `product_edit` before/after**

In `src/app/api/products/[id]/route.ts`, the `existing` variable is already captured at line 29 (`const existing = doc.data()!`). Add a before/after collector alongside the existing `updates` loop. Change:

```typescript
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name' || field === 'category') {
        updates[field] = body[field].trim()
      } else if (field === 'sku') {
        updates.sku = body.sku.trim()
      } else if (field === 'supplierId') {
        updates.supplierId = isNonEmptyString(body.supplierId) ? body.supplierId : null
      } else {
        updates[field] = body[field]
      }
    }
    await docRef.update(updates)

    await writeAuditLog({ action: 'product_edit', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })
```

to:

```typescript
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name' || field === 'category') {
        updates[field] = body[field].trim()
      } else if (field === 'sku') {
        updates.sku = body.sku.trim()
      } else if (field === 'supplierId') {
        updates.supplierId = isNonEmptyString(body.supplierId) ? body.supplierId : null
      } else {
        updates[field] = body[field]
      }
      before[field] = existing[field] ?? null
      after[field] = updates[field]
    }
    await docRef.update(updates)

    await writeAuditLog({
      action: 'product_edit',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: id,
      branchId: null,
      details: { before, after },
    })
```

- [ ] **Step 2: `service_edit` before/after**

In `src/app/api/services/[id]/route.ts`, `existing` is NOT currently captured — add it. Change:

```typescript
    const docRef = db.collection('services').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json()
```

to:

```typescript
    const docRef = db.collection('services').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    const body = await request.json()
```

Then change:

```typescript
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name' || field === 'category') {
        updates[field] = body[field].trim()
      } else if (field === 'description') {
        updates.description = isNonEmptyString(body.description) ? body.description.trim() : null
      } else {
        updates[field] = body[field]
      }
    }
    await docRef.update(updates)

    await writeAuditLog({ action: 'service_edit', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })
```

to:

```typescript
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name' || field === 'category') {
        updates[field] = body[field].trim()
      } else if (field === 'description') {
        updates.description = isNonEmptyString(body.description) ? body.description.trim() : null
      } else {
        updates[field] = body[field]
      }
      before[field] = existing[field] ?? null
      after[field] = updates[field]
    }
    await docRef.update(updates)

    await writeAuditLog({
      action: 'service_edit',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: id,
      branchId: null,
      details: { before, after },
    })
```

- [ ] **Step 3: `supplier_edit` before/after (including the nested `contact` object)**

In `src/app/api/suppliers/[id]/route.ts`, `existing` is already captured at line 35. The `contact` field is nested, so its before/after must be the whole `{phone, email, address}` object, not per-subfield. Change:

```typescript
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name') {
        updates.name = body.name.trim()
      } else if (field === 'notes') {
        updates.notes = isNonEmptyString(body.notes) ? body.notes.trim() : null
      } else if (field === 'contact') {
        if (body.contact !== null && !isPlainObject(body.contact)) {
          return NextResponse.json({ error: 'contact must be an object' }, { status: 400 })
        }
        const source = (body.contact ?? {}) as Record<string, unknown>
        const existingContact = (existing.contact ?? { phone: null, email: null, address: null }) as {
          phone: string | null
          email: string | null
          address: string | null
        }
        const newContact = { ...existingContact }
        try {
          for (const contactField of ['phone', 'email', 'address'] as const) {
            if (contactField in source) newContact[contactField] = validateContactField(source, contactField)
          }
        } catch (validationErr) {
          return NextResponse.json({ error: (validationErr as Error).message }, { status: 400 })
        }
        updates.contact = newContact
      }
    }
    await docRef.update(updates)

    await writeAuditLog({ action: 'supplier_edit', actorUid: user.uid, actorEmail: user.email, targetUid: id, branchId: null })
```

to:

```typescript
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'name') {
        updates.name = body.name.trim()
      } else if (field === 'notes') {
        updates.notes = isNonEmptyString(body.notes) ? body.notes.trim() : null
      } else if (field === 'contact') {
        if (body.contact !== null && !isPlainObject(body.contact)) {
          return NextResponse.json({ error: 'contact must be an object' }, { status: 400 })
        }
        const source = (body.contact ?? {}) as Record<string, unknown>
        const existingContact = (existing.contact ?? { phone: null, email: null, address: null }) as {
          phone: string | null
          email: string | null
          address: string | null
        }
        const newContact = { ...existingContact }
        try {
          for (const contactField of ['phone', 'email', 'address'] as const) {
            if (contactField in source) newContact[contactField] = validateContactField(source, contactField)
          }
        } catch (validationErr) {
          return NextResponse.json({ error: (validationErr as Error).message }, { status: 400 })
        }
        updates.contact = newContact
      }
      before[field] = existing[field] ?? null
      after[field] = updates[field]
    }
    await docRef.update(updates)

    await writeAuditLog({
      action: 'supplier_edit',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: id,
      branchId: null,
      details: { before, after },
    })
```

- [ ] **Step 4: `customer_create` full creation payload**

In `src/app/api/customers/route.ts`, change:

```typescript
    const db = getAdminFirestore()
    const phone = body.phone.trim()
    const newCustomerRef = db.collection('customers').doc()

    try {
      await db.runTransaction(async (tx) => {
        const phoneSnap = await tx.get(db.collection('customers').where('phone', '==', phone).limit(1))
        if (!phoneSnap.empty) {
          throw new AuthError('A customer with this phone number already exists', 409)
        }
        tx.set(newCustomerRef, {
          name: body.name.trim(),
          phone,
          email: isNonEmptyString(body.email) ? body.email.trim() : null,
          address: isNonEmptyString(body.address) ? body.address.trim() : null,
          notes: isNonEmptyString(body.notes) ? body.notes.trim() : null,
          registeredBranchId: user.branchId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({ action: 'customer_create', actorUid: user.uid, actorEmail: user.email, targetUid: newCustomerRef.id, branchId: null })
```

to:

```typescript
    const db = getAdminFirestore()
    const phone = body.phone.trim()
    const newCustomerRef = db.collection('customers').doc()

    const creationPayload = {
      name: body.name.trim(),
      phone,
      email: isNonEmptyString(body.email) ? body.email.trim() : null,
      address: isNonEmptyString(body.address) ? body.address.trim() : null,
      notes: isNonEmptyString(body.notes) ? body.notes.trim() : null,
      registeredBranchId: user.branchId,
    }

    try {
      await db.runTransaction(async (tx) => {
        const phoneSnap = await tx.get(db.collection('customers').where('phone', '==', phone).limit(1))
        if (!phoneSnap.empty) {
          throw new AuthError('A customer with this phone number already exists', 409)
        }
        tx.set(newCustomerRef, {
          ...creationPayload,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'customer_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: newCustomerRef.id,
      branchId: null,
      details: creationPayload,
    })
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Confirm the audit-log viewer needs no change**

Run: `grep -n "details" src/components/audit/AuditLogTable.tsx`
Expected: one match, `{row.details ? JSON.stringify(row.details) : '—'}` — confirms the viewer already renders `details` generically with no shape assumption, so no viewer change is needed and no existing entry (with or without `details`) is affected.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/products/[id]/route.ts src/app/api/services/[id]/route.ts src/app/api/suppliers/[id]/route.ts src/app/api/customers/route.ts
git commit -m "fix(audit): capture before/after detail on product/service/supplier edits and the customer-create payload (TD-1)"
```

---

### Task 3: TD-2 write-path — add `resultingQuantity` to every `stockMovements` write

**Files:**
- Modify: `src/app/api/stock/movements/route.ts`
- Modify: `src/app/api/stock/transfer/route.ts`
- Modify: `src/app/api/sales/route.ts` (the `POST` transaction — the `GET` handler was already touched in Task 1 and is untouched here)

**Interfaces:**
- Produces: every `stockMovements` document written by these three files now has a `resultingQuantity: number` field — the exact post-write `productStock.quantity` for that specific movement, computed inside the same transaction, never reconstructed later. Consumed by Task 4.

**This task deliberately does not touch `src/app/api/sales/[id]/void/route.ts`.** Record this reasoning in your task report rather than silently omitting it: every movement `void` writes has a strictly positive `quantityDelta` (it restores stock a prior sale took). For `onLowStock`'s crossing check (`quantityAfter <= reorderThreshold && quantityBefore > reorderThreshold`) to ever fire, `quantityBefore` must be *greater* than `quantityAfter` — but for any positive-delta movement, `quantityBefore = quantityAfter - quantityDelta` is *always less than* `quantityAfter`, by arithmetic, regardless of any race-condition-induced imprecision in the read of `quantityAfter`. So a `void` movement can never trigger a low-stock notification, correctly or incorrectly, whether or not it carries `resultingQuantity` — leaving it untouched does not leave any part of the race window open. Task 4's fallback logic (reconstruction) remains correct and sufficient for `void` movements and for any movement written before this phase.

- [ ] **Step 1: `stock/movements/route.ts` — the value is already computed, just persist it**

In `src/app/api/stock/movements/route.ts`, change:

```typescript
        const stockSnap = await tx.get(stockRef)
        const currentQuantity = (stockSnap.data()?.quantity as number | undefined) ?? 0
        const resultingQuantity = currentQuantity + quantityDelta
        if (resultingQuantity < 0) {
          throw new AuthError('Insufficient stock for this adjustment', 409)
        }

        tx.set(
          stockRef,
          { branchId, productId, quantity: FieldValue.increment(quantityDelta), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(movementRef, {
          productId,
          branchId,
          type,
          quantityDelta,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId: null,
        })
```

to:

```typescript
        const stockSnap = await tx.get(stockRef)
        const currentQuantity = (stockSnap.data()?.quantity as number | undefined) ?? 0
        const resultingQuantity = currentQuantity + quantityDelta
        if (resultingQuantity < 0) {
          throw new AuthError('Insufficient stock for this adjustment', 409)
        }

        tx.set(
          stockRef,
          { branchId, productId, quantity: FieldValue.increment(quantityDelta), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(movementRef, {
          productId,
          branchId,
          type,
          quantityDelta,
          resultingQuantity,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId: null,
        })
```

`resultingQuantity` was already being computed on the line above (previously only used for the negative-stock guard) — this task adds it to the write, nothing about the guard or the `productStock` increment changes.

- [ ] **Step 2: `stock/transfer/route.ts` — capture the discarded destination read, compute both resulting quantities**

The destination stock snapshot is currently read but discarded (`await tx.get(destStockRef)` with no assignment) — capture it to compute the destination's resulting quantity. Change:

```typescript
        const sourceSnap = await tx.get(sourceStockRef)
        await tx.get(destStockRef)

        const sourceQuantity = (sourceSnap.data()?.quantity as number | undefined) ?? 0
        const resultingSourceQuantity = sourceQuantity - quantity
        if (resultingSourceQuantity < 0) {
          throw new AuthError('Insufficient stock at source branch for this transfer', 409)
        }

        tx.set(
          sourceStockRef,
          { branchId: sourceBranchId, productId, quantity: FieldValue.increment(-quantity), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(
          destStockRef,
          { branchId: destBranchId, productId, quantity: FieldValue.increment(quantity), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(outMovementRef, {
          productId,
          branchId: sourceBranchId,
          type: 'transfer_out',
          quantityDelta: -quantity,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId,
        })
        tx.set(inMovementRef, {
          productId,
          branchId: destBranchId,
          type: 'transfer_in',
          quantityDelta: quantity,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId,
        })
```

to:

```typescript
        const sourceSnap = await tx.get(sourceStockRef)
        const destSnap = await tx.get(destStockRef)

        const sourceQuantity = (sourceSnap.data()?.quantity as number | undefined) ?? 0
        const resultingSourceQuantity = sourceQuantity - quantity
        if (resultingSourceQuantity < 0) {
          throw new AuthError('Insufficient stock at source branch for this transfer', 409)
        }
        const destQuantity = (destSnap.data()?.quantity as number | undefined) ?? 0
        const resultingDestQuantity = destQuantity + quantity

        tx.set(
          sourceStockRef,
          { branchId: sourceBranchId, productId, quantity: FieldValue.increment(-quantity), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(
          destStockRef,
          { branchId: destBranchId, productId, quantity: FieldValue.increment(quantity), updatedAt: new Date() },
          { merge: true }
        )
        tx.set(outMovementRef, {
          productId,
          branchId: sourceBranchId,
          type: 'transfer_out',
          quantityDelta: -quantity,
          resultingQuantity: resultingSourceQuantity,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId,
        })
        tx.set(inMovementRef, {
          productId,
          branchId: destBranchId,
          type: 'transfer_in',
          quantityDelta: quantity,
          resultingQuantity: resultingDestQuantity,
          reason,
          actorUid: user.uid,
          createdAt: new Date(),
          transferId,
        })
```

`resultingDestQuantity` is written on `transfer_in` for completeness (every write in this file now carries the field), even though — by the same positive-delta argument as `void` — it can never be the movement that trips a low-stock crossing. The negative-stock guard logic (which only ever checks `resultingSourceQuantity`) is unchanged.

- [ ] **Step 3: `sales/route.ts` — the value is already computed per line item, just persist it**

In `src/app/api/sales/route.ts`, inside the `POST` transaction, change:

```typescript
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
```

to:

```typescript
        for (const pl of normalized.productLines) {
          const quantityTaken = quantityTakenMap.get(pl.itemId)!
          const currentQuantity = (stockSnaps.get(pl.itemId)!.data()?.quantity as number | undefined) ?? 0
          const resultingQuantity = currentQuantity - quantityTaken
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
            resultingQuantity,
            reason: null,
            actorUid: user.uid,
            createdAt: new Date(),
            transferId: null,
            saleId: saleRef.id,
          })
        }
```

`currentQuantity` here reuses the exact same `stockSnaps` map already populated earlier in this same transaction (line ~190-193 of the pre-existing code) for the backorder-shortfall computation — no new read is added. `quantityTakenMap` is the exact map already used to decide `quantityTaken` for the stock decrement immediately above. Nothing about `quantityTaken`'s computation, the backorder logic, or the `productStock` decrement changes.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Confirm no behavioral change to existing logic**

Run: `git diff --stat` and re-read each hunk. Confirm: (a) every negative-stock guard (`resultingQuantity < 0` in movements, `resultingSourceQuantity < 0` in transfer) still uses exactly the same comparison it did before; (b) `FieldValue.increment(...)` calls are byte-identical to before in every hunk; (c) the only additions are the `resultingQuantity`/`resultingDestQuantity` local variables and their corresponding fields on the movement-doc writes.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/stock/movements/route.ts src/app/api/stock/transfer/route.ts src/app/api/sales/route.ts
git commit -m "feat(stock): add resultingQuantity to every stockMovements write, computed inside the existing transaction (TD-2 write-path)"
```

---

### Task 4: TD-2 read-path — `onLowStock` reads the stored `resultingQuantity`

**Files:**
- Modify: `functions/src/lowStock.ts`

**Interfaces:**
- Consumes: `stockMovements.resultingQuantity` (Task 3) when present.
- Produces: no new exports — same `onLowStock` trigger, same notification-write behavior when a crossing is detected.

- [ ] **Step 1: Read the stored value directly, with a reconstruction fallback for movements that don't have it**

In `functions/src/lowStock.ts`, change:

```typescript
    const { productId, branchId, quantityDelta } = movement as {
      productId: string
      branchId: string
      quantityDelta: number
    }

    const db = getFunctionsFirestore()

    const [productSnap, stockSnap, branchSnap] = await Promise.all([
      db.collection('products').doc(productId).get(),
      db.collection('productStock').doc(`${branchId}_${productId}`).get(),
      db.collection('branches').doc(branchId).get(),
    ])
    if (!productSnap.exists || !stockSnap.exists) return

    const reorderThreshold = productSnap.data()!.reorderThreshold as number
    const quantityAfter = stockSnap.data()!.quantity as number
    // The movement's own transaction already incremented productStock by
    // the time this trigger fires (same atomic write), so subtracting this
    // movement's own delta reconstructs the pre-movement quantity. Known,
    // documented limitation (tracked as TD-2 in docs/tech-debt.md): if a
    // second movement for the same product+branch lands between that
    // transaction committing and this handler's read, quantityAfter
    // reflects BOTH movements, not just this one — the "before" value
    // would be off. Accepted for this phase's traffic level; there is no
    // other way to reconstruct it without storing a quantity snapshot on
    // stockMovements itself, which would mean touching the already-audited
    // write path this phase must not touch.
    const quantityBefore = quantityAfter - quantityDelta
```

to:

```typescript
    const { productId, branchId, quantityDelta, resultingQuantity } = movement as {
      productId: string
      branchId: string
      quantityDelta: number
      resultingQuantity?: number
    }

    const db = getFunctionsFirestore()

    const [productSnap, stockSnap, branchSnap] = await Promise.all([
      db.collection('products').doc(productId).get(),
      db.collection('productStock').doc(`${branchId}_${productId}`).get(),
      db.collection('branches').doc(branchId).get(),
    ])
    if (!productSnap.exists || !stockSnap.exists) return

    const reorderThreshold = productSnap.data()!.reorderThreshold as number
    // TD-2, resolved: the movement's own transaction (api/stock/movements,
    // api/stock/transfer, api/sales) now snapshots the actual post-movement
    // quantity onto the movement doc itself as `resultingQuantity`, read
    // directly here — no reconstruction, no race window, for every
    // movement written after this phase shipped. `resultingQuantity` is
    // only absent for a movement that predates this phase, or for a `void`
    // reversal (api/sales/[id]/void/route.ts, deliberately not touched —
    // its quantityDelta is always positive, so it can never trip the
    // crossing check below regardless of precision). For those cases only,
    // fall back to the original reconstruction, which carries the
    // documented race-window limitation but is provably irrelevant for
    // void's always-positive delta and immaterial for aged historical data.
    const quantityAfter =
      typeof resultingQuantity === 'number' ? resultingQuantity : (stockSnap.data()!.quantity as number)
    const quantityBefore = quantityAfter - quantityDelta
```

Note the exact-post-movement value from Task 3 is used directly as `quantityAfter` when present, rather than the separately-read `stockSnap`'s current value — this is the actual fix: `stockSnap` (read fresh by this trigger, after the transaction committed) is exactly the value that can be polluted by a second movement landing in the gap; `movement.resultingQuantity` was captured atomically inside the original transaction and cannot be. The fallback path (no `resultingQuantity`) is the only place `stockSnap`'s value is still used for `quantityAfter`, preserving today's exact behavior for movements this phase doesn't touch.

- [ ] **Step 2: Build the Cloud Functions project**

Run: `cd functions && npm run build`
Expected: no errors.

- [ ] **Step 3: Confirm the crossing logic itself is unchanged**

Run: `git diff functions/src/lowStock.ts` and confirm the line `const newlyCrossed = quantityAfter <= reorderThreshold && quantityBefore > reorderThreshold` and everything below it (recipient resolution, the notification batch write, the `isAlreadyExistsError` retry-swallow) is untouched — only the derivation of `quantityAfter`/`quantityBefore` above it changed.

- [ ] **Step 4: Commit**

```bash
git add functions/src/lowStock.ts
git commit -m "fix(functions): onLowStock reads the stored resultingQuantity instead of reconstructing it, closing the TD-2 race window"
```

- [ ] **Step 5: Deploy — requires explicit go-ahead before running**

This changes a live Cloud Function in `erp-lfd`, this project's only environment. Do not run the deploy command without asking first, even though this project has deployed Cloud Function changes before (Phase 6, Phase 14, Phase 15). When approved:

Run: `firebase deploy --only functions:onLowStock`
Expected: deploy succeeds; note the deployed function's update timestamp for the completion report.

---

### Task 5: Live verification against real `erp-lfd` data

**Files:** None — this task runs the exit criteria directly against the real environment, no code changes.

Per this project's standing rule ([[feedback-lfd-erp-workflow]] item 4), do not write synthetic test data to `erp-lfd` without the user's explicit go-ahead for each write. Confirm with the user which real/newly-created accounts and records to use before starting.

- [ ] **Step 1 (Task 1):** As `admin`, `general_manager`, and `super_admin` (org-wide roles), call `GET /api/sales` and confirm each sees sales from every branch, not just their own. As `branch_manager` and `cashier`, confirm each still sees only their own branch's sales. Repeat the same matrix against `/pos/sales` (the page, not just the API) to confirm the page-level fix.

- [ ] **Step 2 (Task 1):** Confirm `GET /api/reports/sales` behavior is unchanged for both a `branch_manager` and a `general_manager` — same result shape and branch scoping as before this phase (no regression from Task 1, since that route was deliberately not touched).

- [ ] **Step 3 (Task 2):** Edit a real product (change `price` and `reorderThreshold`), a real service (change `price`), and a real supplier (change `contact.phone`). For each, read the resulting `auditLogs` entry directly and confirm `details.before`/`details.after` show exactly the changed fields with correct old/new values — fields not touched by the edit must not appear. Create a real customer and confirm the `customer_create` entry's `details` matches the creation payload exactly (name/phone/email/address/notes/registeredBranchId).

- [ ] **Step 4 (Task 3/4 — the regression check that matters most):** Perform one normal, sufficiently-stocked sale; one normal stock adjustment (`restock`); one normal stock transfer between two branches. For each, confirm: `productStock.quantity` ends up at exactly the value it would have before this phase (i.e., the stock decrement/increment logic is provably unchanged); the new `stockMovements` doc has the correct `resultingQuantity`; and the sale/adjustment/transfer otherwise behaves identically to its pre-phase behavior (same response shape, same status codes).

- [ ] **Step 5 (Task 3/4 — the actual race-window fix):** Confirm a low-stock notification fires correctly on a movement that newly crosses the reorder threshold, using `resultingQuantity` (not a fresh `productStock` read) — e.g. by checking the Cloud Function's logs or the resulting `notifications` doc against the expected quantity. If practical, demonstrate the fix directly: trigger two movements for the same product+branch in quick succession and confirm the first movement's notification decision used its own `resultingQuantity`, not a `productStock` value already polluted by the second movement.

- [ ] **Step 6:** Confirm a `void` reversal (Task 3's deliberately-untouched path) still behaves exactly as before — restores stock correctly, and its movement doc has no `resultingQuantity` field (confirming it was correctly left alone), with no crash anywhere that reads `stockMovements` docs (e.g. `getLabRecords`-adjacent or reporting code that might iterate `stockMovements` generically — confirm none exists that would choke on a missing field).

- [ ] **Step 7:** Write the completion report at `docs/superpowers/plans/2026-07-11-phase-20-tech-debt-resolution-completion.md`, recording the exact pass/fail count against this task's checks, and update `CLAUDE.md`'s status section and `docs/tech-debt.md` to mark TD-1 and TD-2 resolved and the `GET /api/sales` decision implemented, following the same structure as every prior phase's completion note.

---

## Self-Review

**Spec coverage:**
- `GET /api/sales` scoping fix, `pos/sales/page.tsx` checked and fixed, `api/reports/sales/route.ts` confirmed unaffected → Task 1.
- TD-1: before/after on `product_edit`/`service_edit`/`supplier_edit`, full payload on `customer_create` → Task 2.
- TD-2: `resultingQuantity` on every `stockMovements` write across the three named files, `onLowStock` reads it directly, race window closed → Tasks 3-4.
- Regression check (normal sale/adjustment/transfer behave identically) → Task 5 Step 4.
- No new scope → Global Constraints, and Task 3's explicit note on why `void` is out of scope rather than silently forgotten.

**Placeholder scan:** No TBD/TODO markers; every step shows exact code. Task 5 is a live-verification checklist, consistent with this project's established practice (no automated test runner).

**Type consistency:** `resultingQuantity`/`resultingSourceQuantity`/`resultingDestQuantity` field names in Task 3 match exactly what Task 4's `functions/src/lowStock.ts` reads (`movement.resultingQuantity`). `before`/`after` object shape in Task 2 matches across all three edit routes. `creationPayload` in Task 2 Step 4 is used both for the Firestore write and the audit `details`, guaranteeing they can never drift apart.
