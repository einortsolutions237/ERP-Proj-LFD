# Phase 15 — Laboratory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lab test ordering and results entry — the third clinical collection, following the exact `treatments`/`appointments` precedent — and comprehensively resolve TD-3 (customer deletion referential integrity) across all three clinical collections in the same phase.

**Architecture:** Two new collections, `labOrders` (one per ordered test) and `labResults` (zero-or-one per order, holding a structured array of value lines — not free text). Both fully closed in Firestore rules, same as `treatments`/`appointments`. One combined capability `clinical.lab.manage` (order + record results) mapped to `CLINICAL_ROLES` by reference; `clinical.lab.view` mapped to `CLINICAL_VIEW_ROLES` by reference — both reused, not new lists, so neither can drift from `clinical.record.*`'s already-corrected role sets. A shared `getLabRecords` helper is the single call site for viewing (audit-logged once per call, same discipline as `getPatientTreatments`/`getAppointments`). Recording results is the one transaction-critical write in this phase: it must atomically create the `labResults` doc and flip the referenced `labOrders.status` to `completed`, and reject if that order already has a result — the same read-check-write discipline as every other Firestore transaction in this app. A new Cloud Function notifies the ordering doctor when a result is entered, following the exact `onAppointmentScheduled` template. The customer detail page gets its fourth section, replacing Phase 13's "Will appear once Lab exists" placeholder, under the same strict "do not touch the rest of the file" standard every phase since Phase 9 has held that file to. TD-3 is resolved comprehensively in the same phase: `DELETE /api/customers/[id]` is extended to block on `treatments`, `appointments`, **and** `labOrders` together, not just a fourth narrow check.

**Tech Stack:** Same as the rest of the app — Next.js Server Components + API routes, Firebase Admin SDK, Firestore, Cloud Functions v2. No unit test suite in this project (confirmed convention through Phases 13/13.1/14) — verification per task is `npx tsc --noEmit` clean plus confirming imported signatures against live source; the phase closes with live verification against real `erp-lfd` data, gated on the user's explicit go-ahead.

## Global Constraints

- No dedicated lab-technician role — results entry stays with `doctor`/`super_admin`, same actor set as ordering and as `clinical.record.create`. No structured test-type catalog — `testName` is free text, same reasoning as keeping `treatments.prescription` free text in Phase 13.
- No doctor sign-off/review step before results are visible — a result is visible to `clinical.lab.view` holders the instant it's entered.
- No link from a lab order back to the appointment or treatment that prompted it — same reasoning as the deferred treatment-appointment link from Phase 14.
- `doctorUid`/`branchId` on `labOrders` are always server-derived from the acting user (`user.uid`/`user.branchId`) — never client-supplied. This mirrors `treatments`' exact derivation (the simple "creator's own identity" mechanism), **not** `appointments`' target-staff-doc-validation mechanism — see Decision #1 below for why.
- `labOrders`/`labResults`: no direct client read or write in Firestore rules — same closed pattern as `treatments`/`appointments`.
- Viewing lab data (the combined order+result view) must produce its own audit log entry, `lab_view`, via one shared call site — the same "true by construction" discipline as `getPatientTreatments`/`getAppointments`.
- The customer detail page's existing Purchase History, Clinical record, and Upcoming appointments sections must be provably unchanged — diffed against the pre-phase version, same standard every phase since Phase 9 has been held to.
- This phase deliberately opens `src/app/api/customers/[id]/route.ts` (otherwise outside a Phase 15's natural scope) to resolve TD-3 comprehensively — CLAUDE.md's own known-issues policy flagged this as the right moment, so this is not a boundary violation.

## Decisions requiring your sign-off before implementation

### 1. `doctorUid`/`branchId` on `labOrders` use `treatments`' derivation mechanism, not `appointments`'

The brief says `doctorUid` is "server-derived, never client-supplied — same as treatments/appointments," but those two precedents actually derive it differently: `treatments.doctorUid` is simply `user.uid` (whoever created it — the actor IS the doctor, or `super_admin` acting directly), while `appointments.doctorUid` is validated against a **different**, client-referenced staff doc (because `medical_secretary` can book on a doctor's behalf, so creator ≠ doctor).

`clinical.lab.manage` is granted only to `CLINICAL_ROLES` (`super_admin`, `doctor` — no `medical_secretary`), the identical actor set as `clinical.record.create`. There is no "act on someone else's behalf" scenario here, so this plan uses `treatments`' simpler mechanism: `doctorUid: user.uid`, `branchId: user.branchId`, both taken directly from the session, never read from the request body at all.

**Resolved as above unless you object** — flagging the ambiguity rather than silently picking the more complex `appointments` mechanism it doesn't actually need.

### 2. A labOrder's `status` transitions to `completed` only when a result is entered, enforced by a transaction, and re-entry is rejected

The brief's data model lists `status (ordered / completed)` but doesn't spell out what triggers the transition. The only lifecycle event that makes sense is "results were entered" — so `POST /api/lab-results` is a transaction that reads the order, rejects with `409` if its status is already `completed` (no double-entry), creates the `labResults` doc, and flips the order to `completed`, atomically. This is the one place in this phase with a genuine atomicity requirement (two related writes that must never be observed half-done), so it gets the same transaction discipline as stock movements and Phase 14's overlap check, and its task gets Opus-tier review accordingly.

**Resolved as above unless you object.**

### 3. `GET /api/lab-orders` exists as a real HTTP route, filtered by `customerId`, mirroring `treatments`' exact shape

Unlike Phase 14's `appointments` (which narrowed its public `GET` surface to `doctorUid` only, since a richer `customerId` filter was only ever needed by an in-process caller), there's no dedicated lab schedule/list page in this phase's scope, and the plan's own exit criteria requires verifying `clinical.lab.view`'s 403 "via direct API call, same as every prior clinical capability" — which needs a real endpoint to call. So `GET /api/lab-orders?customerId=` is built as a full, symmetric route (matching `GET /api/treatments?customerId=` exactly), even though the customer detail page itself calls the shared `getLabRecords` helper directly in-process (the same Server-Component pattern every other clinical section uses, not via this HTTP route).

**Resolved as above unless you object.**

### 4. Notification `relatedId` is the customer's ID, not the lab order's or result's ID

`appointment_scheduled`'s `relatedId` is the appointment ID because `/appointments` is a real page that can filter by it implicitly. There's no dedicated lab page in this phase's scope, so the only sensible click-through destination for a "new lab result" notification is the customer's own detail page — which needs a customer ID, not an order/result ID, to build a URL (`/customers/{relatedId}`). This plan sets `relatedId: customerId` on the `lab_result_entered` notification and adds a matching `NOTIFICATION_LINKS` entry.

**Resolved as above unless you object.**

### 5. `labResults` needs no composite index; only `labOrders` does

A `labResults` doc is looked up by a single equality filter (`labOrderId == X`, `limit(1)`) with no `orderBy` — Firestore's automatic single-field indexing covers this, no manual index entry needed (confirmed against this codebase's own precedent: `appointmentOverlap`'s equality-only query needs none either). `labOrders` needs `customerId` (equality) + `orderedAt` (order, descending — most-recent-first, matching `treatments`' exact index shape) since the customer page lists a patient's orders newest-first.

**Resolved as above unless you object.**

---

## Task 1: Permissions, types, audit actions, notification wiring

**Review tier: Opus** (capability grant, matching this project's unwavering practice — every capability-grant task in this project has been Opus-reviewed: Phase 13's Task 1, Phase 13.1's only task, Phase 14's Task 1).

1. `src/lib/auth/permissions.ts` — Modify:
   - Add `'clinical.lab.manage' | 'clinical.lab.view'` to the `Capability` type union, immediately after `'clinical.appointments.manage'`.
   - Add both to `CAPABILITY_MODULE`, mapped to `'clinical'`, immediately after the `'clinical.appointments.manage': 'clinical',` line:
     ```ts
     'clinical.lab.manage': 'clinical',
     'clinical.lab.view': 'clinical',
     ```
   - Add both to `ROLE_CAPABILITIES`, immediately after the `'clinical.appointments.manage': CLINICAL_VIEW_ROLES,` line:
     ```ts
     'clinical.lab.manage': CLINICAL_ROLES,
     'clinical.lab.view': CLINICAL_VIEW_ROLES,
     ```
   - Do not add a new role-group constant. Do not touch `CLINICAL_ROLES`, `CLINICAL_VIEW_ROLES`, `ROLES`, `BRANCH_LOCKED_ROLES`, or any other capability's role list — both new capabilities reference the two existing constants exactly as they stand today (`CLINICAL_ROLES = ['super_admin', 'doctor']`, `CLINICAL_VIEW_ROLES = ['super_admin', 'doctor', 'medical_secretary']`).

2. `src/lib/types/audit.ts` — Modify: add `| 'lab_order_create' | 'lab_result_create' | 'lab_view'` to the `AuditAction` union, immediately after the existing `'appointment_create' | 'appointment_update' | 'appointment_view'` line. Nothing else changes.

3. `src/lib/types/notification.ts` — Modify: add `'lab_result_entered'` as a fifth member of `NotificationType`:
   ```ts
   export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed' | 'appointment_scheduled' | 'lab_result_entered'
   ```
   Nothing else in this file changes.

4. `src/lib/types/labOrder.ts` — Create:
   ```ts
   export type LabOrderStatus = 'ordered' | 'completed'

   export interface LabOrder {
     id: string
     customerId: string
     doctorUid: string
     branchId: string
     testName: string
     instructions: string | null
     status: LabOrderStatus
     orderedAt: FirebaseFirestore.Timestamp
     createdAt: FirebaseFirestore.Timestamp
     updatedAt: FirebaseFirestore.Timestamp
   }
   ```

5. `src/lib/types/labResult.ts` — Create:
   ```ts
   export type LabResultFlag = 'normal' | 'low' | 'high'

   export interface LabResultValue {
     parameter: string
     value: string
     unit: string | null
     referenceRange: string | null
     flag: LabResultFlag | null
   }

   export interface LabResult {
     id: string
     labOrderId: string
     values: LabResultValue[]
     enteredBy: string
     enteredAt: FirebaseFirestore.Timestamp
   }
   ```

6. `src/components/notifications/NotificationBell.tsx` — Modify: add one entry to `NOTIFICATION_LINKS`, immediately after the `appointment_scheduled` line:
   ```ts
   lab_result_entered: (relatedId) => `/customers/${relatedId}`,
   ```
   Nothing else in this file changes. (Required because `NOTIFICATION_LINKS` is typed as `Record<NotificationType, ...>`, which is exhaustive — `tsc` will fail without this entry, the same reason Phase 14's Task 1 needed the equivalent line.)

**Interfaces produced for Tasks 2-8:** `Capability` gains `'clinical.lab.manage'`/`'clinical.lab.view'`; `LabOrder`/`LabOrderStatus` from `@/lib/types/labOrder`; `LabResult`/`LabResultValue`/`LabResultFlag` from `@/lib/types/labResult`; `AuditAction` gains `'lab_order_create'`/`'lab_result_create'`/`'lab_view'`; `NotificationType` gains `'lab_result_entered'`.

---

## Task 2: Firestore rules + composite index

**Review tier: Sonnet** (mechanical, same shape as existing entries).

1. `firestore.rules` — Modify: add, immediately before the final catch-all `match /{document=**}` block, alongside the other fully-closed collections:
   ```
   match /labOrders/{labOrderId} {
     allow read, write: if false; // all access goes through /api/lab-orders — clinical data, same fully-closed treatment as treatments/appointments/leaveRequests/attendanceRecords/notifications, plus every read is separately audit-logged server-side
   }
   match /labResults/{labResultId} {
     allow read, write: if false; // all access goes through /api/lab-results — clinical data, same fully-closed treatment as labOrders
   }
   ```

2. `firestore.indexes.json` — Modify: add one composite index to the existing `indexes` array (per Decision #5, `labResults` needs none):
   ```json
   {
     "collectionGroup": "labOrders",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "customerId", "order": "ASCENDING" },
       { "fieldPath": "orderedAt", "order": "DESCENDING" }
     ]
   }
   ```
   Nothing else in either file changes.

---

## Task 3: Shared `getLabRecords` view/audit helper

**Review tier: Sonnet** (no transaction here — purely a read + single audit write, the same non-transactional shape as `getAppointments`; the one transaction-critical piece of this phase lives in Task 4).

1. `src/lib/clinical/getLabRecords.ts` — Create:
   ```ts
   import { getAdminFirestore } from '@/lib/firebase/admin'
   import { writeAuditLog } from '@/lib/audit/log'
   import { hasCapability } from '@/lib/auth/permissions'
   import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
   import type { LabOrder, LabOrderStatus } from '@/lib/types/labOrder'
   import type { LabResult, LabResultFlag } from '@/lib/types/labResult'

   export interface LabResultValueRow {
     parameter: string
     value: string
     unit: string | null
     referenceRange: string | null
     flag: LabResultFlag | null
   }

   export interface LabOrderRow {
     id: string
     customerId: string
     doctorUid: string
     doctorName: string
     testName: string
     instructions: string | null
     status: LabOrderStatus
     orderedAt: string
     result: { values: LabResultValueRow[]; enteredBy: string; enteredByName: string; enteredAt: string } | null
   }

   // Called by both GET /api/lab-orders and the customer detail page's Lab
   // section (a Server Component, same direct-in-process pattern as
   // getPatientTreatments/getAppointments) — same single-call-site-for-
   // audit-logging discipline, so "viewing lab data is read-audit-logged"
   // is true by construction. Re-checks the capability itself rather than
   // trusting the caller already did, same belt-and-suspenders discipline
   // as its two clinical precedents.
   export async function getLabRecords(customerId: string, viewer: SessionUser): Promise<LabOrderRow[]> {
     if (!hasCapability(viewer.role, 'clinical.lab.view')) {
       throw new AuthError('Forbidden', 403)
     }

     const db = getAdminFirestore()
     const ordersSnap = await db
       .collection('labOrders')
       .where('customerId', '==', customerId)
       .orderBy('orderedAt', 'desc')
       .get()

     const orders = ordersSnap.docs.map((d) => ({ id: d.id, data: d.data() as LabOrder }))
     const uniqueDoctorUids = Array.from(new Set(orders.map((o) => o.data.doctorUid)))
     const doctorDocs = await Promise.all(uniqueDoctorUids.map((uid) => db.collection('staff').doc(uid).get()))
     const doctorNames: Record<string, string> = {}
     uniqueDoctorUids.forEach((uid, i) => {
       doctorNames[uid] = (doctorDocs[i].data()?.name as string | undefined) ?? uid
     })

     // At most one result per order (a labOrder <-> labResult relationship
     // is 1:0-or-1, not 1:many) — a single equality-filtered, limit(1) query
     // per order, same Promise.all fan-out shape as the name lookups above.
     const resultSnaps = await Promise.all(
       orders.map((o) => db.collection('labResults').where('labOrderId', '==', o.id).limit(1).get())
     )
     const uniqueEnteredByUids = Array.from(
       new Set(resultSnaps.flatMap((s) => s.docs.map((d) => (d.data() as LabResult).enteredBy)))
     )
     const enteredByDocs = await Promise.all(uniqueEnteredByUids.map((uid) => db.collection('staff').doc(uid).get()))
     const enteredByNames: Record<string, string> = {}
     uniqueEnteredByUids.forEach((uid, i) => {
       enteredByNames[uid] = (enteredByDocs[i].data()?.name as string | undefined) ?? uid
     })

     const rows: LabOrderRow[] = orders.map(({ id, data }, i) => {
       const resultDoc = resultSnaps[i].docs[0]
       const result = resultDoc
         ? (() => {
             const r = resultDoc.data() as LabResult
             return {
               values: r.values,
               enteredBy: r.enteredBy,
               enteredByName: enteredByNames[r.enteredBy] ?? r.enteredBy,
               enteredAt: r.enteredAt.toDate().toISOString(),
             }
           })()
         : null

       return {
         id,
         customerId: data.customerId,
         doctorUid: data.doctorUid,
         doctorName: doctorNames[data.doctorUid] ?? data.doctorUid,
         testName: data.testName,
         instructions: data.instructions,
         status: data.status,
         orderedAt: data.orderedAt.toDate().toISOString(),
         result,
       }
     })

     await writeAuditLog({
       action: 'lab_view',
       actorUid: viewer.uid,
       actorEmail: viewer.email,
       targetUid: customerId,
       branchId: null,
       details: null,
     })

     return rows
   }
   ```

**Interfaces produced for Tasks 4/6/7:** `getLabRecords(customerId, viewer) => Promise<LabOrderRow[]>` and the `LabOrderRow`/`LabResultValueRow` shapes from `@/lib/clinical/getLabRecords`.

---

## Task 4: API routes (order creation, list, result entry)

**Review tier: Opus** (the one transaction-guarded write in this phase — Decision #2's atomic result-entry + order-status-flip, plus the "no double-entry" invariant it protects).

1. `src/app/api/lab-orders/route.ts` — Create:
   ```ts
   import { NextResponse } from 'next/server'
   import { getAdminFirestore } from '@/lib/firebase/admin'
   import { requireCapability, AuthError } from '@/lib/auth/server-guard'
   import { writeAuditLog } from '@/lib/audit/log'
   import { getLabRecords } from '@/lib/clinical/getLabRecords'

   function isNonEmptyString(value: unknown): value is string {
     return typeof value === 'string' && value.trim().length > 0
   }

   export async function GET(request: Request) {
     try {
       const user = await requireCapability('clinical.lab.view')
       const { searchParams } = new URL(request.url)
       const customerId = searchParams.get('customerId')
       if (!isNonEmptyString(customerId)) {
         return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
       }
       const rows = await getLabRecords(customerId, user)
       return NextResponse.json(rows)
     } catch (err) {
       if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
       throw err
     }
   }

   export async function POST(request: Request) {
     try {
       const user = await requireCapability('clinical.lab.manage')
       const body = await request.json()

       if (!isNonEmptyString(body.customerId)) {
         return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
       }
       if (!isNonEmptyString(body.testName)) {
         return NextResponse.json({ error: 'testName is required' }, { status: 400 })
       }

       const db = getAdminFirestore()
       const customerId = body.customerId.trim()
       const customerSnap = await db.collection('customers').doc(customerId).get()
       if (!customerSnap.exists) {
         return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
       }

       let instructions: string | null = null
       if ('instructions' in body && body.instructions !== undefined && body.instructions !== null && body.instructions !== '') {
         if (!isNonEmptyString(body.instructions)) {
           return NextResponse.json({ error: 'instructions must be a string or null' }, { status: 400 })
         }
         instructions = body.instructions.trim()
       }

       const orderData = {
         customerId,
         doctorUid: user.uid,
         branchId: user.branchId,
         testName: body.testName.trim(),
         instructions,
         status: 'ordered' as const,
         orderedAt: new Date(),
         createdAt: new Date(),
         updatedAt: new Date(),
       }
       const docRef = await db.collection('labOrders').add(orderData)

       await writeAuditLog({
         action: 'lab_order_create',
         actorUid: user.uid,
         actorEmail: user.email,
         targetUid: customerId,
         branchId: user.branchId,
         details: null,
       })

       return NextResponse.json({ id: docRef.id }, { status: 201 })
     } catch (err) {
       if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
       throw err
     }
   }
   ```

2. `src/app/api/lab-results/route.ts` — Create:
   ```ts
   import { NextResponse } from 'next/server'
   import { getAdminFirestore } from '@/lib/firebase/admin'
   import { requireCapability, AuthError } from '@/lib/auth/server-guard'
   import { writeAuditLog } from '@/lib/audit/log'
   import type { LabResultFlag } from '@/lib/types/labResult'

   const FLAGS: LabResultFlag[] = ['normal', 'low', 'high']

   function isNonEmptyString(value: unknown): value is string {
     return typeof value === 'string' && value.trim().length > 0
   }

   interface RawValue {
     parameter?: unknown
     value?: unknown
     unit?: unknown
     referenceRange?: unknown
     flag?: unknown
   }

   export async function POST(request: Request) {
     try {
       const user = await requireCapability('clinical.lab.manage')
       const body = await request.json()

       if (!isNonEmptyString(body.labOrderId)) {
         return NextResponse.json({ error: 'labOrderId is required' }, { status: 400 })
       }
       if (!Array.isArray(body.values) || body.values.length === 0) {
         return NextResponse.json({ error: 'values must be a non-empty array' }, { status: 400 })
       }

       const rawValues = body.values as RawValue[]
       for (const v of rawValues) {
         if (!isNonEmptyString(v.parameter)) {
           return NextResponse.json({ error: 'each value requires a parameter' }, { status: 400 })
         }
         if (!isNonEmptyString(v.value)) {
           return NextResponse.json({ error: 'each value requires a value' }, { status: 400 })
         }
         if (v.unit !== undefined && v.unit !== null && !isNonEmptyString(v.unit)) {
           return NextResponse.json({ error: 'unit must be a string or null' }, { status: 400 })
         }
         if (v.referenceRange !== undefined && v.referenceRange !== null && !isNonEmptyString(v.referenceRange)) {
           return NextResponse.json({ error: 'referenceRange must be a string or null' }, { status: 400 })
         }
         if (v.flag !== undefined && v.flag !== null && !FLAGS.includes(v.flag as LabResultFlag)) {
           return NextResponse.json({ error: 'flag must be normal, low, high, or null' }, { status: 400 })
         }
       }

       const values = rawValues.map((v) => ({
         parameter: (v.parameter as string).trim(),
         value: (v.value as string).trim(),
         unit: isNonEmptyString(v.unit) ? (v.unit as string).trim() : null,
         referenceRange: isNonEmptyString(v.referenceRange) ? (v.referenceRange as string).trim() : null,
         flag: (v.flag as LabResultFlag | null | undefined) ?? null,
       }))

       const db = getAdminFirestore()
       const labOrderId = body.labOrderId.trim()
       const orderRef = db.collection('labOrders').doc(labOrderId)
       const resultRef = db.collection('labResults').doc()

       let orderMeta: { customerId: string; branchId: string }
       try {
         orderMeta = await db.runTransaction(async (tx) => {
           const orderSnap = await tx.get(orderRef)
           if (!orderSnap.exists) {
             throw new AuthError('labOrderId does not reference an existing lab order', 400)
           }
           const order = orderSnap.data()!
           if (order.status !== 'ordered') {
             throw new AuthError('Results have already been entered for this order', 409)
           }
           tx.set(resultRef, {
             labOrderId,
             values,
             enteredBy: user.uid,
             enteredAt: new Date(),
           })
           tx.update(orderRef, { status: 'completed', updatedAt: new Date() })
           return { customerId: order.customerId as string, branchId: order.branchId as string }
         })
       } catch (err) {
         if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
         throw err
       }

       await writeAuditLog({
         action: 'lab_result_create',
         actorUid: user.uid,
         actorEmail: user.email,
         targetUid: orderMeta.customerId,
         branchId: orderMeta.branchId,
         details: null,
       })

       return NextResponse.json({ id: resultRef.id }, { status: 201 })
     } catch (err) {
       if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
       throw err
     }
   }
   ```

**Interfaces produced for Tasks 6/7:** `POST /api/lab-orders` accepting `{customerId, testName, instructions?}`, returning `{id}`; `GET /api/lab-orders?customerId=` returning `LabOrderRow[]`; `POST /api/lab-results` accepting `{labOrderId, values: [{parameter, value, unit?, referenceRange?, flag?}]}`, returning `{id}`.

---

## Task 5: Cloud Function notification trigger

**Review tier: Sonnet** (follows an exact existing template, no new architecture).

1. `functions/src/labResultNotifications.ts` — Create:
   ```ts
   import { onDocumentCreated } from 'firebase-functions/v2/firestore'
   import { getFunctionsFirestore } from './firestore'
   import { isAlreadyExistsError } from './idempotent'

   export const onLabResultEntered = onDocumentCreated(
     { document: 'labResults/{labResultId}', database: 'default' },
     async (event) => {
       const result = event.data?.data()
       if (!result) return

       const { labOrderId } = result as { labOrderId: string }

       const db = getFunctionsFirestore()
       const orderSnap = await db.collection('labOrders').doc(labOrderId).get()
       if (!orderSnap.exists) return
       const order = orderSnap.data()!
       const doctorUid = order.doctorUid as string
       const customerId = order.customerId as string
       const testName = order.testName as string

       const customerSnap = await db.collection('customers').doc(customerId).get()
       const customerName = customerSnap.exists ? (customerSnap.data()!.name as string) : customerId

       const labResultId = event.params.labResultId
       const notifRef = db.collection('notifications').doc(`lab_result_entered_${labResultId}`)
       try {
         await notifRef.create({
           recipientUid: doctorUid,
           type: 'lab_result_entered',
           title: 'Lab result entered',
           body: `${testName} for ${customerName}.`,
           relatedId: customerId,
           read: false,
           createdAt: new Date(),
         })
       } catch (err) {
         if (!isAlreadyExistsError(err)) throw err
       }
     }
   )
   ```

2. `functions/src/index.ts` — Modify: add `export { onLabResultEntered } from './labResultNotifications'`. Nothing else changes — `onLowStock`/`onLeaveRequestSubmitted`/`onLeaveRequestReviewed`/`onAppointmentScheduled` exports untouched.

---

## Task 6: UI — order form, results form, lab section, ClinicalSection placeholder removal

**Review tier: Sonnet** (CRUD/UI, no new access-control surface — every check already lives server-side in Tasks 1/4).

1. `src/components/clinical/LabOrderForm.tsx` — Create. `'use client'`:
   ```tsx
   'use client'
   import { useState } from 'react'

   export interface LabOrderFormProps {
     customerId: string
     onDone: () => void
   }

   export default function LabOrderForm({ customerId, onDone }: LabOrderFormProps) {
     const [testName, setTestName] = useState('')
     const [instructions, setInstructions] = useState('')
     const [error, setError] = useState<string | null>(null)
     const [submitting, setSubmitting] = useState(false)

     async function handleSubmit(e: React.FormEvent) {
       e.preventDefault()
       setError(null)
       setSubmitting(true)

       const payload = {
         customerId,
         testName,
         instructions: instructions.trim() || null,
       }

       try {
         const res = await fetch('/api/lab-orders', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(payload),
         })
         const body = await res.json()
         if (!res.ok) {
           setError(body.error ?? 'Request failed')
           setSubmitting(false)
           return
         }
         onDone()
       } catch {
         setError('Request failed')
         setSubmitting(false)
       }
     }

     return (
       <form onSubmit={handleSubmit} className="max-w-md space-y-4">
         <div>
           <label className="block text-sm font-medium text-ink">Test name</label>
           <input
             required
             value={testName}
             onChange={(e) => setTestName(e.target.value)}
             placeholder="e.g. Complete Blood Count"
             className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
           />
         </div>
         <div>
           <label className="block text-sm font-medium text-ink">Instructions (optional)</label>
           <textarea
             value={instructions}
             onChange={(e) => setInstructions(e.target.value)}
             className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
           />
         </div>
         {error && <p className="text-sm text-danger">{error}</p>}
         <button
           type="submit"
           disabled={submitting}
           className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
         >
           Order lab test
         </button>
       </form>
     )
   }
   ```

2. `src/components/clinical/LabResultForm.tsx` — Create. `'use client'`:
   ```tsx
   'use client'
   import { useState } from 'react'

   interface ValueRow {
     parameter: string
     value: string
     unit: string
     referenceRange: string
     flag: '' | 'normal' | 'low' | 'high'
   }

   const EMPTY_ROW: ValueRow = { parameter: '', value: '', unit: '', referenceRange: '', flag: '' }

   export interface LabResultFormProps {
     labOrderId: string
     onDone: () => void
   }

   export default function LabResultForm({ labOrderId, onDone }: LabResultFormProps) {
     const [rows, setRows] = useState<ValueRow[]>([{ ...EMPTY_ROW }])
     const [error, setError] = useState<string | null>(null)
     const [submitting, setSubmitting] = useState(false)

     function updateRow(index: number, field: keyof ValueRow, value: string) {
       setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
     }

     function addRow() {
       setRows((prev) => [...prev, { ...EMPTY_ROW }])
     }

     function removeRow(index: number) {
       setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
     }

     async function handleSubmit(e: React.FormEvent) {
       e.preventDefault()
       setError(null)
       setSubmitting(true)

       const payload = {
         labOrderId,
         values: rows.map((row) => ({
           parameter: row.parameter,
           value: row.value,
           unit: row.unit.trim() || null,
           referenceRange: row.referenceRange.trim() || null,
           flag: row.flag || null,
         })),
       }

       try {
         const res = await fetch('/api/lab-results', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(payload),
         })
         const body = await res.json()
         if (!res.ok) {
           setError(body.error ?? 'Request failed')
           setSubmitting(false)
           return
         }
         onDone()
       } catch {
         setError('Request failed')
         setSubmitting(false)
       }
     }

     return (
       <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-mist p-3">
         {rows.map((row, i) => (
           <div key={i} className="grid grid-cols-5 items-end gap-2">
             <div>
               <label className="block text-xs font-medium text-ink">Parameter</label>
               <input
                 required
                 value={row.parameter}
                 onChange={(e) => updateRow(i, 'parameter', e.target.value)}
                 className="w-full rounded-md border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
               />
             </div>
             <div>
               <label className="block text-xs font-medium text-ink">Value</label>
               <input
                 required
                 value={row.value}
                 onChange={(e) => updateRow(i, 'value', e.target.value)}
                 className="w-full rounded-md border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
               />
             </div>
             <div>
               <label className="block text-xs font-medium text-ink">Unit</label>
               <input
                 value={row.unit}
                 onChange={(e) => updateRow(i, 'unit', e.target.value)}
                 className="w-full rounded-md border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
               />
             </div>
             <div>
               <label className="block text-xs font-medium text-ink">Reference range</label>
               <input
                 value={row.referenceRange}
                 onChange={(e) => updateRow(i, 'referenceRange', e.target.value)}
                 className="w-full rounded-md border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
               />
             </div>
             <div className="flex items-end gap-1">
               <div className="flex-1">
                 <label className="block text-xs font-medium text-ink">Flag</label>
                 <select
                   value={row.flag}
                   onChange={(e) => updateRow(i, 'flag', e.target.value)}
                   className="w-full rounded-md border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
                 >
                   <option value="">—</option>
                   <option value="normal">Normal</option>
                   <option value="low">Low</option>
                   <option value="high">High</option>
                 </select>
               </div>
               <button
                 type="button"
                 onClick={() => removeRow(i)}
                 disabled={rows.length === 1}
                 className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist disabled:opacity-50"
               >
                 −
               </button>
             </div>
           </div>
         ))}
         <button
           type="button"
           onClick={addRow}
           className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist"
         >
           + Add row
         </button>
         {error && <p className="text-sm text-danger">{error}</p>}
         <div>
           <button
             type="submit"
             disabled={submitting}
             className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
           >
             Save results
           </button>
         </div>
       </form>
     )
   }
   ```

3. `src/components/clinical/LabSection.tsx` — Create. `'use client'`:
   ```tsx
   'use client'
   import { useState } from 'react'
   import { useRouter } from 'next/navigation'
   import LabOrderForm from './LabOrderForm'
   import LabResultForm from './LabResultForm'
   import type { LabOrderRow } from '@/lib/clinical/getLabRecords'

   export interface LabSectionProps {
     customerId: string
     orders: LabOrderRow[]
     canManage: boolean
   }

   export default function LabSection({ customerId, orders, canManage }: LabSectionProps) {
     const router = useRouter()
     const [showOrderForm, setShowOrderForm] = useState(false)
     const [resultsOrderId, setResultsOrderId] = useState<string | null>(null)

     return (
       <div className="space-y-3">
         <h2 className="text-lg font-medium text-ink">Lab orders</h2>
         {orders.length === 0 ? (
           <p className="text-sm text-slate">No lab orders yet.</p>
         ) : (
           <div className="space-y-4">
             {orders.map((order) => (
               <div key={order.id} className="space-y-2 rounded-md border border-mist p-3">
                 <div className="flex items-center justify-between">
                   <div>
                     <div className="text-sm font-medium text-ink">{order.testName}</div>
                     <div className="text-xs text-slate">
                       Ordered {new Date(order.orderedAt).toLocaleString()} by {order.doctorName} · {order.status}
                     </div>
                     {order.instructions && <div className="text-xs text-slate">Instructions: {order.instructions}</div>}
                   </div>
                   {canManage && order.status === 'ordered' && (
                     <button
                       type="button"
                       onClick={() => setResultsOrderId((prev) => (prev === order.id ? null : order.id))}
                       className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist"
                     >
                       Enter results
                     </button>
                   )}
                 </div>
                 {order.result ? (
                   <div className="overflow-hidden rounded-md border border-mist">
                     <table className="w-full text-sm">
                       <thead>
                         <tr className="bg-mist/40">
                           <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Parameter</th>
                           <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Value</th>
                           <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Unit</th>
                           <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reference range</th>
                           <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Flag</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-mist">
                         {order.result.values.map((v, i) => (
                           <tr key={i}>
                             <td className="px-3 py-2 text-ink">{v.parameter}</td>
                             <td className="px-3 py-2 text-ink">{v.value}</td>
                             <td className="px-3 py-2 text-ink">{v.unit ?? '—'}</td>
                             <td className="px-3 py-2 text-ink">{v.referenceRange ?? '—'}</td>
                             <td className="px-3 py-2 text-ink">{v.flag ?? '—'}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                     <p className="px-3 py-2 text-xs text-slate">
                       Entered {new Date(order.result.enteredAt).toLocaleString()} by {order.result.enteredByName}
                     </p>
                   </div>
                 ) : (
                   resultsOrderId === order.id && (
                     <LabResultForm
                       labOrderId={order.id}
                       onDone={() => {
                         setResultsOrderId(null)
                         router.refresh()
                       }}
                     />
                   )
                 )}
               </div>
             ))}
           </div>
         )}

         {canManage && (
           <div className="space-y-3">
             <button
               type="button"
               onClick={() => setShowOrderForm((prev) => !prev)}
               className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
             >
               Order lab test
             </button>
             {showOrderForm && (
               <LabOrderForm
                 customerId={customerId}
                 onDone={() => {
                   setShowOrderForm(false)
                   router.refresh()
                 }}
               />
             )}
           </div>
         )}
       </div>
     )
   }
   ```

4. `src/components/clinical/ClinicalSection.tsx` — Modify: remove only the "Lab results" placeholder block (lines shown below), leaving the "Seminar attendance" placeholder (Phase 16) and everything else in this file completely untouched:
   ```tsx
   <div className="space-y-1">
     <h3 className="text-sm font-medium text-ink">Lab results</h3>
     <p className="text-sm text-slate">Will appear once Lab exists (Phase 15).</p>
   </div>
   ```
   The diff for this file must show only a deletion of these four lines — no other change.

**Interfaces produced for Task 7:** `LabSection` (`customerId`, `orders: LabOrderRow[]`, `canManage: boolean`) from `@/components/clinical/LabSection`.

---

## Task 7: Customer detail page — Lab section

**Review tier: Sonnet**, but the diff review must explicitly confirm the "do not touch" list below — same standard as Phase 14's Task 7.

1. `src/app/(dashboard)/customers/[id]/page.tsx` — Modify:
   - Add import: `import { getLabRecords } from '@/lib/clinical/getLabRecords'` and `import LabSection from '@/components/clinical/LabSection'`.
   - After the existing `const upcomingAppointments = ...` block (Phase 14's addition), add:
     ```ts
     const canViewLab = hasCapability(user.role, 'clinical.lab.view')
     const canManageLab = hasCapability(user.role, 'clinical.lab.manage')
     const labOrders = canViewLab ? await getLabRecords(id, user) : []
     ```
   - After the existing `{canManageAppointments && (<div>...Upcoming appointments...</div>)}` block (the last thing in the returned JSX before its closing `</div>`), add a new sibling block — do not nest it inside the appointments block, do not touch any existing block's own JSX:
     ```tsx
     {canViewLab && (
       <LabSection customerId={id} orders={labOrders} canManage={canManageLab} />
     )}
     ```

   **Do NOT change:** anything inside the Purchase History block's JSX or the `PurchaseRow`/sales-query logic, the `canManage`/Edit/Delete block, the key-value detail block (phone/email/address/notes), the Clinical record section's own JSX (`ClinicalSection` call and its props), the Upcoming appointments section's own JSX (`canManageAppointments`/`upcomingAppointments` consts and their block). The diff for this task must show only: two new imports, three new `const` lines, and one new appended JSX block — nothing inside any pre-existing block touched.

---

## Task 8: Resolve TD-3 comprehensively — customer deletion checks treatments, appointments, and labOrders

**Review tier: Sonnet** (mechanical repetition of the already-proven `sales` check pattern, three times — but the final whole-branch review must verify each of the three independently, not just that one exists).

1. `src/app/api/customers/[id]/route.ts` — Modify the `DELETE` handler: immediately after the existing `sales` check and before `await docRef.delete()`, add three more existence checks, each mirroring the `sales` check exactly:
   ```ts
   const treatmentsSnap = await db.collection('treatments').where('customerId', '==', id).limit(1).get()
   if (!treatmentsSnap.empty) {
     return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a treatment record' }, { status: 409 })
   }
   const appointmentsSnap = await db.collection('appointments').where('customerId', '==', id).limit(1).get()
   if (!appointmentsSnap.empty) {
     return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by an appointment' }, { status: 409 })
   }
   const labOrdersSnap = await db.collection('labOrders').where('customerId', '==', id).limit(1).get()
   if (!labOrdersSnap.empty) {
     return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a lab order' }, { status: 409 })
   }
   ```
   No check against `labResults` is needed — a result always belongs to an order that already references the customer, so blocking on `labOrders` transitively covers it. Nothing else in this file changes (the `PATCH` handler above `DELETE` is untouched; `GET` doesn't exist in this file). `DeleteCustomerButton.tsx` already surfaces any non-2xx response's `error` message generically — no UI change needed for this task.

---

## Execution

Eight tasks, in order (1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 — each depends on the previous; Task 5 (Cloud Function) can run in parallel with Task 6/7/8 since none touch each other's files, but keep it sequential unless you're confident in the parallelization). **Tasks 1 and 4 get Opus review** (capability grant, and the one transaction-guarded write in this phase); **Tasks 2, 3, 5, 6, 7, 8 get Sonnet-tier review**, matching this project's established practice (Opus for access-control/transaction-critical work, Sonnet for CRUD/UI/mechanical repetition of a proven pattern). Final whole-branch review also on Opus, specifically re-checking:

- `clinical.lab.manage`'s role list is exactly `CLINICAL_ROLES` (same as `clinical.record.create`) and `clinical.lab.view`'s is exactly `CLINICAL_VIEW_ROLES` (same as `clinical.record.view`/`clinical.appointments.manage`), confirmed by direct comparison, not just visual similarity.
- Every role *not* in the relevant list gets 403 on `POST /api/lab-orders`, `GET /api/lab-orders`, and `POST /api/lab-results`, verified by direct API call, not just by reading the permissions table.
- The result-entry transaction correctly rejects a second results submission against an already-`completed` order (409), and correctly makes the create-result-doc + flip-order-status pair atomic — trace this directly in the diff, don't take the task's own report on faith.
- `labOrders`/`labResults` have zero client-reachable paths in `firestore.rules`.
- Every code path that lists lab data (the customer detail page's new section and the API route) goes through `getLabRecords` and therefore writes exactly one `lab_view` entry per call — no read path bypasses it.
- `customers/[id]/page.tsx`'s diff touches only what Task 7 describes — Purchase History, Clinical record, and Upcoming appointments sections byte-identical to their pre-Phase-15 state.
- `ClinicalSection.tsx`'s diff is exactly the four-line Lab-results-placeholder deletion — the Seminar attendance placeholder and everything else in that file untouched.
- `NotificationBell.tsx`'s `NOTIFICATION_LINKS` map compiles and the new entry resolves to a sensible route (`/customers/{customerId}`).
- `DELETE /api/customers/[id]` blocks independently on each of `sales`/`treatments`/`appointments`/`labOrders` — verify all four checks individually (e.g. a customer with only a lab order, no sales/treatments/appointments, still gets blocked), not just that the code compiles.

**Live verification** (needs the user's explicit go-ahead before writing any real data to `erp-lfd`, per this project's standing test-data policy): using existing real accounts where possible (the real doctor/medical_secretary/branch_manager/cashier/finance_admin/admin accounts from Phases 8/13/13.1/14, and the real "Test Patient" customer), order a real lab test against the real doctor account; confirm a `branch_manager`/`cashier`/`finance_admin`/`admin` account gets 403 on `POST`/`GET /api/lab-orders` and `POST /api/lab-results`; enter results against the order and confirm the values/unit/range/flag structure persists correctly, structured, not collapsed into text; confirm a second results submission against the same now-`completed` order is rejected with 409; confirm the doctor receives a real `notifications` entry (`lab_result_entered`) linking to the customer's page; confirm the customer detail page's Lab section shows the order+result for a `medical_secretary`/`doctor`/`super_admin` viewer and is absent for a `branch_manager`/`cashier`/`admin` viewer; confirm `auditLogs` shows the expected `lab_order_create`/`lab_result_create`/`lab_view` sequence with no duplicate or missing entries; attempt to delete the "Test Patient" customer (or another customer created for this purpose) and confirm it's now blocked with a lab-order-referencing message, then confirm the same for a customer referenced only by a treatment and only by an appointment, to verify all three checks independently, not just the new one.

**Completion report** matching Phases 8/12/13/14's level of detail: commit hashes, file/line counts, explicit confirmation of every "do not touch" item, the capability-footprint comparison against `clinical.record.*`, a note on all five flagged decisions above and how they held up under review, and explicit confirmation that TD-3 is now fully resolved across `sales`/`treatments`/`appointments`/`labOrders` — not partially, not deferred again.
