# Phase 13 — Clinical Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `doctor` role and a walled-off `treatments` collection tied to the existing `customers` collection, per CLAUDE.md's "LFD Services is a hybrid business" section. No appointments, lab, seminars, or structured prescriptions — those are Phases 14-16 and out of scope here.

**Architecture:** New capability module (`clinical`) with exactly two capabilities (`clinical.record.create`/`clinical.record.view`), granted only to `doctor`/`admin`/`super_admin` — the strictest cut in the app. `treatments` is fully closed in Firestore rules, same as `leaveRequests`/`attendanceRecords`/`notifications`; all access goes through server code. Reads are org-wide (never branch-filtered) since every capability holder is already non-branch-locked. Every clinical *read*, not just every write, gets its own audit log entry — a new pattern, not an extension of an existing one.

**Tech Stack:** Same as the rest of the app — Next.js Server Components + API routes, Firebase Admin SDK, Firestore.

## Global Constraints

- No appointments, lab results, seminar attendance, structured prescriptions, or a doctor-specific dashboard beyond the customer-detail extension — all explicitly out of scope, flagged per the brief's own instruction rather than built speculatively.
- A consultation is billed as an existing `service` through the existing POS flow — zero changes to `api/sales/route.ts`, `CheckoutForm.tsx`, or any billing logic.
- No new `patients` collection — `treatments.customerId` references the existing `customers` collection directly.
- `treatments`: no direct client read or write in Firestore rules — same closed pattern as `leaveRequests`/`attendanceRecords`/`notifications`.
- Every clinical record *view*, not just create, must produce its own audit log entry (`clinical_record_view`, distinct from `clinical_record_create`).
- `doctor` must end up with `clinical.record.create`/`clinical.record.view` and the two universal self-service HR capabilities (`hr.leave.request`/`hr.attendance.self`, granted to every role) — nothing else. No task may add `doctor` to any other capability's role list.
- The existing purchase-history section on `customers/[id]/page.tsx` must be provably unchanged — diffed against the pre-phase version, same standard as every design phase since Phase 9.

## Decisions requiring your sign-off before implementation

This phase has more open judgment calls than usual because it's genuinely new functionality, not an extension of an established pattern. Flagging each rather than guessing:

### 1. How a doctor reaches the customer detail page without unlocking purchase history

`customers/[id]/page.tsx` today gates its entire render on `requireCapability('crm.customer.view')`. `doctor` is not in that capability's role list (`CASHIER_BRANCH_MGR`), and the brief doesn't say it should be — a doctor's access is supposed to be walled to *clinical* data, not commercial data. But the page needs to render *something* for a doctor to see their clinical section at all.

**Proposed fix:** a new `requireAnyCapability(capabilities: Capability[])` helper in `server-guard.ts` — the app's first "OR" gate (every existing page requires exactly one specific capability). The page's top-level gate becomes `requireAnyCapability(['crm.customer.view', 'clinical.record.view'])`. Inside the page, the purchase-history section is *additionally* gated on `hasCapability(user.role, 'crm.customer.view')` specifically (not just "the page rendered") — so a pure-`doctor` viewer (no `crm.customer.view`) reaches the page, sees the customer's name/phone/email/address/notes (basic identity, needed to confirm whose record they're looking at) and the new clinical section, but never sees purchase history. This is the only way I can find to satisfy "a doctor can view any patient's history" (exit criterion) while keeping the wall intact everywhere else on the same page.

### 2. `linkedSaleId` is a plain optional text field, not a picker

A doctor linking a treatment to the sale that paid for it would naturally want to browse the patient's recent sales and pick one. But `pos.sale.view` isn't a capability `doctor` should hold (nothing in the brief asks for this, and granting it would mean a doctor can browse a patient's full purchase history through a side door — recreating exactly the "wall" problem decision #1 exists to prevent). Building a doctor-scoped sales picker is real new UI/access-control surface the brief doesn't ask for.

**Proposed fix:** `linkedSaleId` is a plain optional text input in the treatment form — the doctor types/pastes a sale ID they already know (e.g. from a receipt, or told verbally by the cashier), matching the brief's own restraint elsewhere ("prescription: free text for now"). Server-side, if provided, it's validated against a real `sales` doc (matching this project's established "validate a reference field against a real doc" discipline — same as branchId validation in staff/department creation) and cross-checked that the sale's own `customerId` matches the treatment's `customerId`, so a doctor can't accidentally (or maliciously) link an unrelated sale. A friendlier picker is left for a later phase, once (if ever) doctors get some scoped view into a patient's sales.

### 3. `doctorUid`/`branchId` are always server-derived, never client-supplied

`doctorUid` is always `user.uid` (whoever authenticated and is creating the record — `doctor`, `admin`, or `super_admin`; the field name describes its role in the record, not a literal role check on the creator). `branchId` is always `user.branchId`, written for record-keeping only, exactly as the brief specifies — never read in any query's `where()` clause, never gated by `isBranchLocked` (unnecessary: every capability holder is already non-branch-locked, so there is no branch-locked-vs-not distinction to make for this collection at all).

## Files — Task 1: Permissions & types foundation

1. `src/lib/auth/permissions.ts` — Modify:
   - Add `'doctor'` to `ROLES` (after `'cashier'`).
   - Add `'clinical'` to `MODULES`.
   - Add `'clinical.record.create' | 'clinical.record.view'` to the `Capability` union.
   - Add both to `CAPABILITY_MODULE` (module: `'clinical'`).
   - New role group: `const CLINICAL_ROLES: RoleId[] = ['super_admin', 'admin', 'doctor']`.
   - Add both capabilities to `ROLE_CAPABILITIES`, both mapped to `CLINICAL_ROLES`.
   - Do NOT add `'doctor'` anywhere else in this file. `ALL_ROLES` already spreads `ROLES`, so `hr.leave.request`/`hr.attendance.self` (which use `ALL_ROLES`) automatically include `doctor` with no further edit — this is the mechanism that satisfies "doctor gets the two universal HR capabilities and nothing else."
   - Do NOT add `'doctor'` to `STRICT_AUDIT_ROLES` — doctor signs in via the client SDK path, same as every other non-admin role.
   - Do NOT add `'doctor'` to `BRANCH_LOCKED_ROLES` — doctor is explicitly non-branch-locked per the brief.

2. `src/lib/auth/server-guard.ts` — Modify: add
   ```ts
   export async function requireAnyCapability(capabilities: Capability[]): Promise<SessionUser> {
     const user = await getSessionUser()
     if (!user) throw new AuthError('Not signed in', 401)
     if (!capabilities.some((c) => hasCapability(user.role, c))) throw new AuthError('Forbidden', 403)
     return user
   }
   ```
   Import `hasCapability` alongside the existing imports from `./permissions`. Nothing else in this file changes.

3. `src/lib/types/audit.ts` — Modify: add `'clinical_record_create' | 'clinical_record_view'` to the `AuditAction` union. Nothing else changes.

4. `src/lib/types/treatment.ts` — Create:
   ```ts
   export interface Treatment {
     id: string
     customerId: string
     doctorUid: string
     branchId: string
     date: FirebaseFirestore.Timestamp
     diagnosis: string
     notes: string | null
     prescription: string | null
     linkedSaleId: string | null
     createdAt: FirebaseFirestore.Timestamp
     updatedAt: FirebaseFirestore.Timestamp
   }
   ```

**Verification this task must perform (state explicitly in the report):** walk every entry in `ROLE_CAPABILITIES` after your edit and confirm `'doctor'` appears in exactly the two `clinical.*` entries — nowhere else. This is the literal exit criterion ("no accidental inheritance of any other module's capabilities") and is fully mechanical to verify by inspection.

## Files — Task 2: Firestore rules + composite index

5. `firestore.rules` — Modify: add, alongside the other fully-closed collections (`leaveRequests`/`attendanceRecords`/`notifications`):
   ```
   match /treatments/{treatmentId} {
     allow read, write: if false; // all access goes through /api/treatments — clinical data, same fully-closed treatment as leaveRequests/attendanceRecords/notifications, plus every read is separately audit-logged server-side
   }
   ```
   Insert immediately before the final catch-all `match /{document=**}` block. Nothing else in this file changes.

6. `firestore.indexes.json` — Modify: add a composite index for the query Task 3 will run (`where('customerId', '==', ...).orderBy('date', 'desc')` — an equality filter plus an order-by on a *different* field always needs a composite index in Firestore, the same reason `sales`/`leaveRequests`/`attendanceRecords` already have one each):
   ```json
   {
     "collectionGroup": "treatments",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "customerId", "order": "ASCENDING" },
       { "fieldPath": "date", "order": "DESCENDING" }
     ]
   }
   ```
   Add it to the existing `indexes` array. Nothing else in this file changes.

## Files — Task 3: API routes + shared view-logging helper

7. `src/lib/clinical/getPatientTreatments.ts` — Create. This is the single place the `clinical_record_view` audit-log write happens — both the API route (Task 3) and the customer detail page (Task 4) call it, so the logging logic exists exactly once, not duplicated:
   ```ts
   import { getAdminFirestore } from '@/lib/firebase/admin'
   import { writeAuditLog } from '@/lib/audit/log'
   import { hasCapability } from '@/lib/auth/permissions'
   import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
   import type { Treatment } from '@/lib/types/treatment'

   export interface TreatmentRow {
     id: string
     doctorUid: string
     doctorName: string
     date: string
     diagnosis: string
     notes: string | null
     prescription: string | null
     linkedSaleId: string | null
   }

   // Called by both GET /api/treatments and customers/[id]/page.tsx directly
   // (a Server Component, matching every other page in this app's own direct-
   // Admin-SDK-read pattern — it does not make an HTTP call to the sibling
   // API route). Re-checks the capability itself rather than trusting the
   // caller already did, the same belt-and-suspenders discipline as
   // StaffTable's super_admin delete guard.
   export async function getPatientTreatments(customerId: string, viewer: SessionUser): Promise<TreatmentRow[]> {
     if (!hasCapability(viewer.role, 'clinical.record.view')) {
       throw new AuthError('Forbidden', 403)
     }

     const db = getAdminFirestore()
     // Org-wide on purpose — a patient's clinical history spans every branch
     // they were ever seen at; there is no isBranchLocked check here at all,
     // deliberately, since every clinical.record.view holder is non-branch-locked.
     const snap = await db
       .collection('treatments')
       .where('customerId', '==', customerId)
       .orderBy('date', 'desc')
       .get()

     const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Treatment }))
     const uniqueDoctorUids = Array.from(new Set(docs.map((d) => d.data.doctorUid)))
     const doctorDocs = await Promise.all(uniqueDoctorUids.map((uid) => db.collection('staff').doc(uid).get()))
     const doctorNames: Record<string, string> = {}
     uniqueDoctorUids.forEach((uid, i) => {
       doctorNames[uid] = (doctorDocs[i].data()?.name as string | undefined) ?? uid
     })

     const rows: TreatmentRow[] = docs.map(({ id, data }) => ({
       id,
       doctorUid: data.doctorUid,
       doctorName: doctorNames[data.doctorUid] ?? data.doctorUid,
       date: data.date.toDate().toISOString().slice(0, 10),
       diagnosis: data.diagnosis,
       notes: data.notes,
       prescription: data.prescription,
       linkedSaleId: data.linkedSaleId,
     }))

     await writeAuditLog({
       action: 'clinical_record_view',
       actorUid: viewer.uid,
       actorEmail: viewer.email,
       targetUid: customerId,
       branchId: null,
       details: null,
     })

     return rows
   }
   ```

8. `src/app/api/treatments/route.ts` — Create:
   ```ts
   import { NextResponse } from 'next/server'
   import { getAdminFirestore } from '@/lib/firebase/admin'
   import { requireCapability, AuthError } from '@/lib/auth/server-guard'
   import { writeAuditLog } from '@/lib/audit/log'
   import { getPatientTreatments } from '@/lib/clinical/getPatientTreatments'

   function isNonEmptyString(value: unknown): value is string {
     return typeof value === 'string' && value.trim().length > 0
   }

   export async function GET(request: Request) {
     try {
       const user = await requireCapability('clinical.record.view')
       const { searchParams } = new URL(request.url)
       const customerId = searchParams.get('customerId')
       if (!isNonEmptyString(customerId)) {
         return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
       }
       const rows = await getPatientTreatments(customerId, user)
       return NextResponse.json(rows)
     } catch (err) {
       if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
       throw err
     }
   }

   export async function POST(request: Request) {
     try {
       const user = await requireCapability('clinical.record.create')
       const body = await request.json()

       if (!isNonEmptyString(body.customerId)) {
         return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
       }
       if (!isNonEmptyString(body.date)) {
         return NextResponse.json({ error: 'date is required' }, { status: 400 })
       }
       if (!isNonEmptyString(body.diagnosis)) {
         return NextResponse.json({ error: 'diagnosis is required' }, { status: 400 })
       }

       const db = getAdminFirestore()
       const customerId = body.customerId.trim()
       const customerSnap = await db.collection('customers').doc(customerId).get()
       if (!customerSnap.exists) {
         return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
       }

       let linkedSaleId: string | null = null
       if ('linkedSaleId' in body && body.linkedSaleId !== undefined && body.linkedSaleId !== null && body.linkedSaleId !== '') {
         if (!isNonEmptyString(body.linkedSaleId)) {
           return NextResponse.json({ error: 'linkedSaleId must be a non-empty string' }, { status: 400 })
         }
         const requestedSaleId = body.linkedSaleId.trim()
         const saleSnap = await db.collection('sales').doc(requestedSaleId).get()
         if (!saleSnap.exists) {
           return NextResponse.json({ error: 'linkedSaleId does not reference an existing sale' }, { status: 400 })
         }
         if (saleSnap.data()?.customerId !== customerId) {
           return NextResponse.json({ error: 'linkedSaleId does not belong to this customer' }, { status: 400 })
         }
         linkedSaleId = requestedSaleId
       }

       const treatmentData = {
         customerId,
         doctorUid: user.uid,
         branchId: user.branchId,
         date: new Date(body.date),
         diagnosis: body.diagnosis.trim(),
         notes: isNonEmptyString(body.notes) ? body.notes.trim() : null,
         prescription: isNonEmptyString(body.prescription) ? body.prescription.trim() : null,
         linkedSaleId,
         createdAt: new Date(),
         updatedAt: new Date(),
       }
       const docRef = await db.collection('treatments').add(treatmentData)

       await writeAuditLog({
         action: 'clinical_record_create',
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

**Interfaces produced for Task 4:** `getPatientTreatments(customerId, viewer) => Promise<TreatmentRow[]>` from `@/lib/clinical/getPatientTreatments`; `TreatmentRow` shape (`id`, `doctorUid`, `doctorName`, `date` as `YYYY-MM-DD` string, `diagnosis`, `notes`, `prescription`, `linkedSaleId`); `POST /api/treatments` accepting `{ customerId, date, diagnosis, notes?, prescription?, linkedSaleId? }`.

## Files — Task 4: UI — customer detail page extension

9. `src/components/clinical/TreatmentForm.tsx` — Create. `'use client'` component, mirrors `CustomerForm.tsx`'s shape (field state, `handleSubmit`, error/submitting state, design-system input/button classes from `ProductForm.tsx`). Fields: date (`<input type="date" required>`), diagnosis (`<input required>`), notes (`<textarea>`), prescription (`<textarea>`, labeled to make clear it's free text for now), linkedSaleId (`<input>`, optional, labeled "Linked sale ID (optional)"). Submits `POST /api/treatments` with `customerId` (passed as a prop) plus the form fields; on success calls an `onDone` callback (mirrors `StockAdjustForm`'s `onDone` pattern) so the parent can toggle the form closed and `router.refresh()`.

10. `src/components/clinical/ClinicalSection.tsx` — Create. `'use client'` component (needs the toggle state for showing/hiding `TreatmentForm`, same idiom as `StockTable`'s `openForm`). Props: `customerId: string`, `treatments: TreatmentRow[]`, `canCreate: boolean`. Renders:
    - A treatments list (date, doctor name, diagnosis) — table or stacked rows using the established `ProductTable.tsx`-derived table classes; empty state "No treatments recorded yet." when `treatments.length === 0`.
    - `{canCreate && <button>Add treatment</button>}` toggling `TreatmentForm` inline, matching `StockTable`'s expand-inline-form idiom (not a route navigation to a `/new` page — this section lives entirely within the customer detail page, no new routes).
    - Two explicit, static empty-state blocks, always rendered regardless of data: "Lab results — will appear once Lab exists (Phase 15)." and "Seminar attendance — will appear once Seminars exists (Phase 16)." Do not fetch, query, or fake data for either — these are permanent stubs until their respective phases land.

11. `src/app/(dashboard)/customers/[id]/page.tsx` — Modify:
    - Change the top-level gate from `requireCapability('crm.customer.view')` to `requireAnyCapability(['crm.customer.view', 'clinical.record.view'])`.
    - Add `const canViewCommercial = hasCapability(user.role, 'crm.customer.view')` and wrap the *entire* existing purchase-history `<div className="space-y-3">...</div>` block (the `<h2>Purchase history</h2>` section) in `{canViewCommercial && (...)}`. Do not alter anything inside that block — this is the "provably unchanged" section the exit criteria singles out; the diff here must show only the added wrapping condition, nothing inside it touched.
    - Add `const canViewClinical = hasCapability(user.role, 'clinical.record.view')` and `const canCreateTreatment = hasCapability(user.role, 'clinical.record.create')`.
    - When `canViewClinical`, call `await getPatientTreatments(id, user)` to get the rows, and render `{canViewClinical && <ClinicalSection customerId={id} treatments={treatments} canCreate={canCreateTreatment} />}` alongside (not replacing) the purchase-history section.
    - The existing `canManage` (Edit/Delete) block is untouched — `doctor` is not in `crm.customer.manage`'s role list, so it's already correctly hidden from a doctor with zero changes needed there.

**Do NOT change:** anything inside the purchase-history block's JSX or the `PurchaseRow`/sales-query logic, the `canManage`/Edit/Delete block, the key-value detail block (phone/email/address/notes) — those stay visible to any viewer who reaches the page at all, clinical-only or not, since basic identity information isn't part of the commercial/clinical wall.

## Execution

Four tasks, in order (1 → 2 → 3 → 4 — each depends on the previous). Given the access-control stakes throughout (a new role, the strictest capability cut in the app, a new closed collection, a new audit-on-read pattern, and the patient-data wall itself), **every task gets an Opus task review**, matching this project's established practice for access-control-relevant work (Phase 8, Phase 12). Final whole-branch review also on Opus, specifically re-checking:
- `doctor`'s capability footprint is exactly `clinical.record.create`, `clinical.record.view`, `hr.leave.request`, `hr.attendance.self` — nothing else, walked against every entry in `ROLE_CAPABILITIES`.
- The purchase-history section's diff is empty inside its own block (only the wrapping condition added).
- `treatments` has zero client-reachable paths in `firestore.rules`.
- Every code path that reads a treatment (both the page and the API route) goes through `getPatientTreatments` and therefore writes exactly one `clinical_record_view` entry per view — no read path bypasses it.

Live verification: create a real `doctor` staff account through the existing `/staff/new` flow (this now works automatically — `StaffForm`'s `ASSIGNABLE_ROLES` is `ROLES.filter(r => r !== 'super_admin')`, so `doctor` appears in the role dropdown with zero UI changes), sign in as that doctor, create a treatment for a real existing customer, confirm it appears on that customer's detail page, confirm a `branch_manager`/`cashier`/`hr_admin` account gets 403 on both `POST` and `GET /api/treatments` and sees no clinical section at all, and confirm two separate `auditLogs` entries exist (`clinical_record_create` from the write, `clinical_record_view` from viewing it back) — this needs the user's go-ahead before writing any real data to `erp-lfd`, per this project's standing test-data policy.

Completion report matching Phases 8/12's level of detail: commit hashes, file/line counts, explicit confirmation of every "do not touch" item, the capability-footprint walk, and a note on all three flagged decisions above and how they held up under review.
