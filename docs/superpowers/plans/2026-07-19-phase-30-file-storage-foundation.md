# Phase 30 — File Storage Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, capability-gated file upload/retrieval foundation (`attachments` collection + two API routes) that any future feature can attach files to, with zero UI wiring — proven end-to-end with real emulator-backed tests, not built for `labResults`/`expenses` specifically even though both are registered as its first two consumers.

**Architecture:** A single `attachments` Firestore collection referencing an arbitrary `(relatedCollection, relatedDocId)` pair, fully closed in Firestore/Storage rules like every other collection in this app. A small, explicit capability-lookup map (`src/lib/attachments/capabilityMap.ts`) is the one piece of "knowledge" about which collections are attachable and what capability each requires to manage vs. view — this is the pattern Phase 30.1/30.2 will both read from, not duplicate. `POST /api/attachments` (multipart upload, validates + writes to Storage + Firestore) and `GET /api/attachments/[id]` (streams the file back, gated on the same capability that gates the related record's own view) are the only two access paths; Storage security rules deny everything else, mirroring this project's Firestore-rules philosophy exactly.

**Tech Stack:** Next.js App Router Route Handlers (`request.formData()` for multipart upload, native `File`/`Blob`), `firebase-admin/storage` (already available — `firebase-admin` is already a dependency, no new package), Vitest against the Firestore/Auth/Storage emulators (Storage emulator is new to this project's test harness as of this phase).

## Global Constraints

- `attachments` doc shape: `relatedCollection` (string), `relatedDocId` (string), `storagePath` (string), `fileName` (string), `mimeType` (string), `sizeBytes` (number), `uploadedBy` (string, uid), `branchId` (string | null — see Decision 1 below), `createdAt` (Timestamp). No bespoke `scanUrl`/`receiptUrl` fields anywhere else.
- Accepted file types: `image/jpeg`, `image/png`, `application/pdf` only. Size cap: 10MB (`10 * 1024 * 1024` bytes exactly).
- Storage rules fully closed: `allow read, write: if false`, matching `firestore.rules`' existing pattern for every closed collection (`treatments`, `appointments`, etc.). All real access goes through the two API routes using the Admin SDK.
- `attachments` gets the same closed treatment in `firestore.rules`.
- No UI changes anywhere — no changes to `LabResultForm.tsx`, the expense form, or any other component. Two new API route files and their supporting lib/type/rules/test-harness files only.
- No new npm dependency.

## Investigation findings (read before touching anything)

1. **`clinical.lab.results.enter`** (manage/create for `labResults`) is backed by `LAB_RESULTS_ENTER_ROLES = ['super_admin', 'doctor', 'lab_staff']`. **`clinical.lab.view`** is backed by `LAB_VIEW_ROLES = ['super_admin', 'doctor', 'medical_secretary', 'general_manager', 'lab_staff', 'nurse']`. Real asymmetry exists and will be tested: `medical_secretary`, `general_manager`, and `nurse` can view a lab-result attachment but cannot upload one.
2. **`accounting.expense.create`** is backed by `ACCOUNTING_EXPENSE_CREATE_ROLES = ['super_admin', 'finance_admin']`. **`accounting.expense.view`** is backed by `ACCOUNTING_VIEW_ROLES = ['super_admin', 'finance_admin', 'general_manager']`. Real asymmetry: `general_manager` can view an expense attachment but cannot upload one.
3. In both cases, every manage-capable role is also view-capable (`LAB_RESULTS_ENTER_ROLES ⊆ LAB_VIEW_ROLES`, `ACCOUNTING_EXPENSE_CREATE_ROLES ⊆ ACCOUNTING_VIEW_ROLES`) — there is no real "can manage but not view" case for either of today's two registered collections. The exit criteria's "if any such asymmetry exists" phrasing anticipated this might not hold; it doesn't, for either current consumer, confirmed by reading the actual role-list constants, not assumed.
4. **Decision 1 — `branchId` inheritance is genuinely impossible to do uniformly.** `Expense` has a `branchId: string` field (`src/lib/types/expense.ts:7`) — straightforward to inherit. **`LabResult` has no `branchId` field at all** (`src/lib/types/labResult.ts` — only `id`/`labOrderId`/`values`/`notes`/`enteredBy`/`enteredAt`), confirmed directly in `POST /api/lab-results`'s own write (`src/app/api/lab-results/route.ts:84-90`), which never writes a `branchId` onto the result doc — lab data is deliberately org-wide, not branch-scoped, consistent with the rest of the clinical module. The brief's "inherited from the related record's own branch scoping" is therefore implemented as: `attachments.branchId = (relatedDoc.data()?.branchId as string | undefined) ?? null` — a purely generic rule that reads whatever the related doc actually has, with no per-collection special-casing. This means every `labResults` attachment will have `branchId: null` and every `expenses` attachment will have the real branch id. This is the correct generic behavior, not a bug — flagging it here so it isn't mistaken for one during review.
5. `requireCapability(capability)` (`src/lib/auth/server-guard.ts:40`) takes a compile-time-known `Capability` literal — it cannot be used directly here since the required capability depends on the request's `relatedCollection` at runtime. Both routes instead call `getSessionUser()` then manually check `hasCapability(user.role, requiredCapability)` and throw `AuthError` themselves — the exact pattern `getPendingDeliveries.ts`/`getSaleDetail.ts` already use for their own belt-and-suspenders rechecks.
6. No Storage emulator is configured anywhere yet (`firebase.json`, `firebase.testing.json` both currently only configure `firestore`/`auth`). This phase adds one, following the exact same two-file split (`firestore.rules` deployed / `firestore.test.rules` permissive-emulator-only) already established for Firestore.
7. `src/lib/firebase/admin.ts`'s `getAdminFirestore()` already had to pass an explicit database ID because relying on the SDK default failed against this project's actual Firestore setup — the same defensiveness applies here: `getAdminStorage()` passes `storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` explicitly at app-init time (that env var already exists in `.env.local`, confirmed) rather than relying on the SDK to infer it.
8. `GET /api/attachments/[id]` streams the file's bytes directly (`bucket.file(path).download()` → a `Response` with the stored `mimeType`) rather than returning a signed URL. The brief allows either ("returns a short-lived signed URL or streams the file"); streaming was chosen because it has no dependency on IAM `signBlob` permissions or Storage-emulator signed-URL support (both real, separate sources of environment-specific friction this project has hit before with other emulator quirks) and is simpler for a ~10MB cap.
9. Test pattern for exercising the real `labResults`/`expenses` creation paths: call the actual route handlers directly (`POST /api/expenses`, `POST /api/lab-orders` then `POST /api/lab-results`), exactly like `tests/integration/expenses.test.ts` and the lab test suites already do — no new bespoke Firestore-seed fixtures needed for these two related-record types.

## File Structure

- Modify: `src/lib/firebase/admin.ts` — add `getAdminStorage()`.
- Create: `src/lib/types/attachment.ts` — `Attachment` interface.
- Create: `src/lib/attachments/capabilityMap.ts` — `AttachableCollection` type + `ATTACHMENT_CAPABILITIES` map.
- Modify: `src/lib/types/audit.ts` — add `'attachment_upload'` to `AuditAction`.
- Create: `src/app/api/attachments/route.ts` — `POST` (upload).
- Create: `src/app/api/attachments/[id]/route.ts` — `GET` (retrieve).
- Create: `storage.rules` — closed, for deployment.
- Modify: `firebase.json` — register `storage.rules`.
- Create: `storage.test.rules` — permissive, emulator-only.
- Modify: `firebase.testing.json` — add the Storage emulator + `storage.test.rules`.
- Modify: `firestore.rules` — add closed `attachments` match block.
- Modify: `package.json` — extend the `test` script's `--only` flag to include `storage`.
- Create: `tests/integration/attachments.test.ts`.

**Explicitly untouched, and why:** `LabResultForm.tsx`, the expense form/pages, and every other UI file — no upload button anywhere yet, per the brief's own scope limit. That's Phase 30.1/30.2.

---

### Task 1: Storage foundation + `POST /api/attachments` (upload)

**Files:**
- Modify: `src/lib/firebase/admin.ts`
- Create: `src/lib/types/attachment.ts`
- Create: `src/lib/attachments/capabilityMap.ts`
- Modify: `src/lib/types/audit.ts`
- Create: `src/app/api/attachments/route.ts`
- Create: `storage.rules`
- Modify: `firebase.json`
- Create: `storage.test.rules`
- Modify: `firebase.testing.json`
- Modify: `firestore.rules`
- Modify: `package.json`
- Test: `tests/integration/attachments.test.ts` (upload half only — Task 2 adds the retrieval tests to this same file)

**Interfaces:**
- Produces: `getAdminStorage(): Storage` from `@/lib/firebase/admin`. `Attachment` interface from `@/lib/types/attachment`. `AttachableCollection` type + `ATTACHMENT_CAPABILITIES: Record<AttachableCollection, { manage: Capability; view: Capability }>` from `@/lib/attachments/capabilityMap` — Task 2's `GET` route consumes `ATTACHMENT_CAPABILITIES` and `AttachableCollection` by these exact names.
- Consumes: `Capability`/`RoleId`/`hasCapability` from `@/lib/auth/permissions`, `getSessionUser`/`AuthError`/`SessionUser` from `@/lib/auth/server-guard`, `writeAuditLog` from `@/lib/audit/log`, `getAdminFirestore` from `@/lib/firebase/admin`.

- [ ] **Step 1: Add `getAdminStorage()` to the Admin SDK module**

Modify `src/lib/firebase/admin.ts` — add the storage bucket to app init and export a new accessor. Full file:

```typescript
import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

function getAdminApp(): App {
  if (getApps().length) return getApp()
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

// This project's Firestore database was provisioned with the explicit
// database ID "default" (Firestore Enterprise edition's creation flow
// requires naming a database — it does not offer the SDK's implicit,
// specially-reserved "(default)" database). getFirestore(app) with no
// second argument targets "(default)" and fails with NOT_FOUND against
// this project — the ID must be passed explicitly.
const FIRESTORE_DATABASE_ID = 'default'

export function getAdminFirestore() {
  return getFirestore(getAdminApp(), FIRESTORE_DATABASE_ID)
}

export function getAdminStorage() {
  return getStorage(getAdminApp())
}
```

- [ ] **Step 2: Add the `Attachment` type**

Create `src/lib/types/attachment.ts`:

```typescript
export interface Attachment {
  id: string
  relatedCollection: string
  relatedDocId: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedBy: string
  branchId: string | null
  createdAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 3: Add the capability-lookup map**

Create `src/lib/attachments/capabilityMap.ts`:

```typescript
import type { Capability } from '@/lib/auth/permissions'

// The one place that knows which collections can have attachments, and
// which capability gates managing (uploading to) vs. viewing each one.
// Phase 30.1 (lab scans) and 30.2 (expense receipts) both read from this
// map rather than each inventing their own capability lookup — adding a
// third attachable collection later means adding one entry here, nothing
// else in the foundation changes.
export type AttachableCollection = 'labResults' | 'expenses'

export const ATTACHMENT_CAPABILITIES: Record<AttachableCollection, { manage: Capability; view: Capability }> = {
  labResults: { manage: 'clinical.lab.results.enter', view: 'clinical.lab.view' },
  expenses: { manage: 'accounting.expense.create', view: 'accounting.expense.view' },
}

export function isAttachableCollection(value: string): value is AttachableCollection {
  return value in ATTACHMENT_CAPABILITIES
}
```

- [ ] **Step 4: Add the new audit action**

Modify `src/lib/types/audit.ts` — add `'attachment_upload'` to the `AuditAction` union, after `'payroll_record_create'`:

```typescript
export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'staff_create' | 'staff_edit' | 'staff_delete'
  | 'permission_change'
  | 'supplier_create' | 'supplier_edit' | 'supplier_delete'
  | 'product_create' | 'product_edit' | 'product_delete'
  | 'service_create' | 'service_edit' | 'service_delete'
  | 'stock_adjust' | 'stock_transfer'
  | 'sale_create' | 'sale_void'
  | 'customer_create' | 'customer_edit' | 'customer_delete'
  | 'leave_request_create' | 'leave_request_approve' | 'leave_request_reject'
  | 'attendance_checkin' | 'attendance_checkout'
  | 'clinical_record_create' | 'clinical_record_view'
  | 'appointment_create' | 'appointment_update' | 'appointment_view'
  | 'lab_order_create' | 'lab_result_create' | 'lab_view' | 'lab_worklist_view'
  | 'seminar_create' | 'seminar_edit' | 'seminar_attendance_record' | 'seminar_attendance_view'
  | 'pending_delivery_fulfilled'
  | 'patient_demographics_record'
  | 'nursing_visit_record'
  | 'intake_questionnaire_edit'
  | 'intake_view'
  | 'message_create'
  | 'expense_create'
  | 'payroll_record_create'
  | 'attachment_upload'

export interface AuditLogEntry {
  id: string
  action: AuditAction
  actorUid: string | null
  actorEmail: string | null
  targetUid: string | null
  branchId: string | null
  details: Record<string, unknown> | null
  createdAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 5: Write the upload route**

Create `src/app/api/attachments/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import { getSessionUser, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { ATTACHMENT_CAPABILITIES, isAttachableCollection } from '@/lib/attachments/capabilityMap'

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) throw new AuthError('Not signed in', 401)

    const formData = await request.formData()
    const relatedCollection = formData.get('relatedCollection')
    const relatedDocId = formData.get('relatedDocId')
    const file = formData.get('file')

    if (typeof relatedCollection !== 'string' || !isAttachableCollection(relatedCollection)) {
      return NextResponse.json({ error: 'relatedCollection must be one of: labResults, expenses' }, { status: 400 })
    }
    if (typeof relatedDocId !== 'string' || relatedDocId.trim().length === 0) {
      return NextResponse.json({ error: 'relatedDocId is required' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const { manage } = ATTACHMENT_CAPABILITIES[relatedCollection]
    if (!hasCapability(user.role, manage)) {
      throw new AuthError('Forbidden', 403)
    }

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type}" — only JPEG, PNG, and PDF are accepted` },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File is ${file.size} bytes, exceeding the ${MAX_SIZE_BYTES} byte (10MB) limit` },
        { status: 400 }
      )
    }

    const db = getAdminFirestore()
    const relatedRef = db.collection(relatedCollection).doc(relatedDocId)
    const relatedSnap = await relatedRef.get()
    if (!relatedSnap.exists) {
      return NextResponse.json({ error: 'relatedDocId does not reference an existing document' }, { status: 400 })
    }
    const branchId = (relatedSnap.data()?.branchId as string | undefined) ?? null

    const attachmentRef = db.collection('attachments').doc()
    const storagePath = `attachments/${relatedCollection}/${relatedDocId}/${attachmentRef.id}-${file.name}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const bucket = getAdminStorage().bucket()
    await bucket.file(storagePath).save(buffer, { contentType: file.type })

    await attachmentRef.set({
      relatedCollection,
      relatedDocId,
      storagePath,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedBy: user.uid,
      branchId,
      createdAt: new Date(),
    })

    await writeAuditLog({
      action: 'attachment_upload',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: relatedDocId,
      branchId,
      details: { relatedCollection, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
    })

    return NextResponse.json({ id: attachmentRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 6: Storage rules — closed, for deployment**

Create `storage.rules`:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false; // Admin SDK bypasses rules entirely; no client path, ever
    }
  }
}
```

- [ ] **Step 7: Register storage rules for deployment**

Modify `firebase.json` — add a `"storage"` block:

```json
{
  "firestore": [
    {
      "database": "default",
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    }
  ],
  "storage": {
    "rules": "storage.rules"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log", "*.local"]
    }
  ]
}
```

- [ ] **Step 8: Add the `attachments` Firestore rule**

Modify `firestore.rules` — add this match block alongside the other closed collections (e.g. next to `treatments`/`appointments`):

```
    match /attachments/{attachmentId} {
      allow read, write: if false; // all access goes through the Admin SDK via /api/attachments
    }
```

- [ ] **Step 9: Permissive Storage rules for the emulator**

Create `storage.test.rules`:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true; // emulator-only — never deployed, referenced only by firebase.testing.json
    }
  }
}
```

- [ ] **Step 10: Wire the Storage emulator into the test harness**

Modify `firebase.testing.json` — full file:

```json
{
  "firestore": [
    {
      "database": "default",
      "rules": "firestore.test.rules"
    }
  ],
  "storage": {
    "rules": "storage.test.rules"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "storage": { "port": 9199 },
    "ui": { "enabled": false }
  }
}
```

- [ ] **Step 11: Extend the test script to start the Storage emulator**

Modify `package.json`'s `"test"` script — change:

```json
    "test": "firebase emulators:exec --config firebase.testing.json --only firestore,auth \"vitest run\"",
```

to:

```json
    "test": "firebase emulators:exec --config firebase.testing.json --only firestore,auth,storage \"vitest run\"",
```

- [ ] **Step 12: Write the failing upload tests**

Create `tests/integration/attachments.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postAttachment } from '@/app/api/attachments/route'
import { POST as postExpense } from '@/app/api/expenses/route'
import { POST as postLabOrder } from '@/app/api/lab-orders/route'
import { POST as postLabResult } from '@/app/api/lab-results/route'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff, seedCustomer } from '../setup/fixtures'

describe('POST /api/attachments', () => {
  let branchA: string
  let financeAdminCookie: string
  let generalManagerCookie: string
  let doctorCookie: string
  let labStaffCookie: string
  let nurseCookie: string
  let expenseId: string
  let labResultId: string

  function jsonRequest(url: string, body: unknown) {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  function uploadRequest(relatedCollection: string, relatedDocId: string, file: File) {
    const form = new FormData()
    form.set('relatedCollection', relatedCollection)
    form.set('relatedDocId', relatedDocId)
    form.set('file', file)
    return new Request('http://localhost/api/attachments', { method: 'POST', body: form })
  }

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Attachments Test Branch A')
    branchA = a.id
    financeAdminCookie = (await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-att@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm-att@test.local' })).sessionCookie
    doctorCookie = (await seedStaff({ role: 'doctor', branchId: branchA, email: 'doc-att@test.local' })).sessionCookie
    labStaffCookie = (await seedStaff({ role: 'lab_staff', branchId: branchA, email: 'ls-att@test.local' })).sessionCookie
    nurseCookie = (await seedStaff({ role: 'nurse', branchId: branchA, email: 'nu-att@test.local' })).sessionCookie

    const expenseRes = await withSession(financeAdminCookie, () =>
      postExpense(jsonRequest('http://localhost/api/expenses', { date: '2026-07-19', category: 'Supplies', amount: 75, description: 'Gauze and gloves' }))
    )
    expenseId = (await expenseRes.json()).id

    const customer = await seedCustomer({ name: 'Attachments Test Customer', phone: '+1000000077' })
    const orderRes = await withSession(doctorCookie, () =>
      postLabOrder(jsonRequest('http://localhost/api/lab-orders', { customerId: customer.id, testName: 'CBC' }))
    )
    const labOrderId = (await orderRes.json()).id
    const resultRes = await withSession(doctorCookie, () =>
      postLabResult(jsonRequest('http://localhost/api/lab-results', { labOrderId, values: [{ parameter: 'WBC', value: '6.2', unit: 'K/uL' }] }))
    )
    labResultId = (await resultRes.json()).id
  })

  it('finance_admin uploads a PDF receipt attached to a real expense, branchId inherited from the expense', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'receipt.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(201)
    const { id } = await res.json()

    const doc = await getAdminFirestore().collection('attachments').doc(id).get()
    expect(doc.data()!.relatedCollection).toBe('expenses')
    expect(doc.data()!.relatedDocId).toBe(expenseId)
    expect(doc.data()!.fileName).toBe('receipt.pdf')
    expect(doc.data()!.mimeType).toBe('application/pdf')
    expect(doc.data()!.sizeBytes).toBe(4)
    expect(doc.data()!.branchId).toBe(branchA)

    const [exists] = await getAdminStorage().bucket().file(doc.data()!.storagePath).exists()
    expect(exists).toBe(true)

    const auditSnap = await getAdminFirestore().collection('auditLogs').where('action', '==', 'attachment_upload').where('targetUid', '==', expenseId).get()
    expect(auditSnap.empty).toBe(false)
  })

  it('doctor uploads a JPEG scan attached to a real lab result, branchId is null (labResults has no branchId field)', async () => {
    const file = new File([new Uint8Array([5, 6, 7])], 'scan.jpg', { type: 'image/jpeg' })
    const res = await withSession(doctorCookie, () => postAttachment(uploadRequest('labResults', labResultId, file)))
    expect(res.status).toBe(201)
    const { id } = await res.json()
    const doc = await getAdminFirestore().collection('attachments').doc(id).get()
    expect(doc.data()!.branchId).toBeNull()
  })

  it('lab_staff (holds clinical.lab.results.enter) can also upload a lab result attachment', async () => {
    const file = new File([new Uint8Array([9])], 'scan2.png', { type: 'image/png' })
    const res = await withSession(labStaffCookie, () => postAttachment(uploadRequest('labResults', labResultId, file)))
    expect(res.status).toBe(201)
  })

  it('general_manager can view expenses but cannot upload one — rejected 403', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(generalManagerCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(403)
  })

  it('nurse can view lab results but cannot upload one — rejected 403', async () => {
    const file = new File([new Uint8Array([1])], 'x.jpg', { type: 'image/jpeg' })
    const res = await withSession(nurseCookie, () => postAttachment(uploadRequest('labResults', labResultId, file)))
    expect(res.status).toBe(403)
  })

  it('rejects an unregistered relatedCollection with a clear 400', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('products', 'whatever', file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/relatedCollection/)
  })

  it('rejects a nonexistent relatedDocId with a clear 400', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', 'does-not-exist', file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/does not reference/)
  })

  it('rejects an unsupported file type with a clear 400', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Unsupported file type/)
  })

  it('rejects a file over the 10MB cap with a clear 400', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    const file = new File([big], 'huge.pdf', { type: 'application/pdf' })
    const res = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/exceeding/)
  })

  it('rejects an unauthenticated request', async () => {
    const file = new File([new Uint8Array([1])], 'x.pdf', { type: 'application/pdf' })
    const res = await withSession(null, () => postAttachment(uploadRequest('expenses', expenseId, file)))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 13: Run the test file to verify it fails**

Run: `npx vitest run tests/integration/attachments.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/attachments/route'` (before Step 5 is applied — if running steps in order, this file already exists by the time you reach Step 13; run this step immediately after Step 12 in a scratch check by temporarily reverting Step 5's file, or simply confirm each assertion is meaningful by inspecting it — the important RED evidence for this task is: run the suite once *before* Step 1 changes exist to confirm module-not-found, per standard TDD discipline. If you implemented Steps 1-11 before writing the test, run this test file now against the just-built code and treat a clean pass as GREEN with Step 13 as your only checkpoint; note which order you actually used in your report.)

- [ ] **Step 14: Run the full suite**

Run: `npm test`
Expected: All tests passing, including the new attachment upload tests. Note the new total in your report.

- [ ] **Step 15: Commit**

```bash
git add src/lib/firebase/admin.ts src/lib/types/attachment.ts src/lib/attachments/capabilityMap.ts src/lib/types/audit.ts src/app/api/attachments/route.ts storage.rules firebase.json storage.test.rules firebase.testing.json firestore.rules package.json tests/integration/attachments.test.ts
git commit -m "feat(attachments): add Storage foundation, capability map, and upload route"
```

---

### Task 2: `GET /api/attachments/[id]` (retrieve)

**Files:**
- Create: `src/app/api/attachments/[id]/route.ts`
- Test: `tests/integration/attachments.test.ts` (append retrieval tests to the same file Task 1 created)

**Interfaces:**
- Consumes: `ATTACHMENT_CAPABILITIES`, `AttachableCollection` from `@/lib/attachments/capabilityMap` (Task 1). `getAdminFirestore`/`getAdminStorage` from `@/lib/firebase/admin`. `getSessionUser`/`AuthError` from `@/lib/auth/server-guard`. `hasCapability` from `@/lib/auth/permissions`.

- [ ] **Step 1: Write the retrieval route**

Create `src/app/api/attachments/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import { getSessionUser, AuthError } from '@/lib/auth/server-guard'
import { ATTACHMENT_CAPABILITIES, isAttachableCollection } from '@/lib/attachments/capabilityMap'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await getSessionUser()
    if (!user) throw new AuthError('Not signed in', 401)

    const db = getAdminFirestore()
    const doc = await db.collection('attachments').doc(id).get()
    if (!doc.exists) throw new AuthError('Not found', 404)

    const data = doc.data()!
    const relatedCollection = data.relatedCollection as string
    if (!isAttachableCollection(relatedCollection)) {
      // Defensive only — every attachment is written by this app's own
      // upload route, which already validates relatedCollection against
      // this same map, so this branch should be unreachable in practice.
      throw new AuthError('Not found', 404)
    }

    const { view } = ATTACHMENT_CAPABILITIES[relatedCollection]
    if (!hasCapability(user.role, view)) {
      throw new AuthError('Forbidden', 403)
    }

    const bucket = getAdminStorage().bucket()
    const [buffer] = await bucket.file(data.storagePath as string).download()

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': data.mimeType as string,
        'Content-Disposition': `inline; filename="${data.fileName as string}"`,
        'Content-Length': String(data.sizeBytes as number),
      },
    })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 2: Append the failing retrieval tests**

Add to the end of the `describe('POST /api/attachments', ...)` block's sibling — append a new top-level `describe` block at the end of `tests/integration/attachments.test.ts`, after the closing `})` of the upload suite. First add this import line to the top of the file, alongside the other route imports:

```typescript
import { GET as getAttachment } from '@/app/api/attachments/[id]/route'
```

Then append:

```typescript
describe('GET /api/attachments/[id]', () => {
  let branchA: string
  let financeAdminCookie: string
  let generalManagerCookie: string
  let hrAdminCookie: string
  let doctorCookie: string
  let nurseCookie: string
  let expenseAttachmentId: string
  let labAttachmentId: string

  function jsonRequest(url: string, body: unknown) {
    return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }

  function uploadRequest(relatedCollection: string, relatedDocId: string, file: File) {
    const form = new FormData()
    form.set('relatedCollection', relatedCollection)
    form.set('relatedDocId', relatedDocId)
    form.set('file', file)
    return new Request('http://localhost/api/attachments', { method: 'POST', body: form })
  }

  function getRequest(id: string) {
    return new Request(`http://localhost/api/attachments/${id}`)
  }

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Attachments Retrieval Branch A')
    branchA = a.id
    financeAdminCookie = (await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-ret@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm-ret@test.local' })).sessionCookie
    hrAdminCookie = (await seedStaff({ role: 'hr_admin', branchId: branchA, email: 'hr-ret@test.local' })).sessionCookie
    doctorCookie = (await seedStaff({ role: 'doctor', branchId: branchA, email: 'doc-ret@test.local' })).sessionCookie
    nurseCookie = (await seedStaff({ role: 'nurse', branchId: branchA, email: 'nu-ret@test.local' })).sessionCookie

    const expenseRes = await withSession(financeAdminCookie, () =>
      postExpense(jsonRequest('http://localhost/api/expenses', { date: '2026-07-19', category: 'Supplies', amount: 40, description: 'Retrieval test expense' }))
    )
    const expenseId = (await expenseRes.json()).id
    const expenseFile = new File([new Uint8Array([1, 2, 3])], 'receipt.pdf', { type: 'application/pdf' })
    const uploadExpenseRes = await withSession(financeAdminCookie, () => postAttachment(uploadRequest('expenses', expenseId, expenseFile)))
    expenseAttachmentId = (await uploadExpenseRes.json()).id

    const customer = await seedCustomer({ name: 'Retrieval Test Customer', phone: '+1000000088' })
    const orderRes = await withSession(doctorCookie, () => postLabOrder(jsonRequest('http://localhost/api/lab-orders', { customerId: customer.id, testName: 'BMP' })))
    const labOrderId = (await orderRes.json()).id
    const resultRes = await withSession(doctorCookie, () =>
      postLabResult(jsonRequest('http://localhost/api/lab-results', { labOrderId, values: [{ parameter: 'Na', value: '140', unit: 'mmol/L' }] }))
    )
    const labResultId = (await resultRes.json()).id
    const labFile = new File([new Uint8Array([4, 5, 6, 7])], 'scan.jpg', { type: 'image/jpeg' })
    const uploadLabRes = await withSession(doctorCookie, () => postAttachment(uploadRequest('labResults', labResultId, labFile)))
    labAttachmentId = (await uploadLabRes.json()).id
  })

  it('the uploader can retrieve their own expense attachment — full upload-then-retrieve cycle, correct bytes and content-type', async () => {
    const res = await withSession(financeAdminCookie, () => getAttachment(getRequest(expenseAttachmentId), { params: Promise.resolve({ id: expenseAttachmentId }) }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(bytes)).toEqual([1, 2, 3])
  })

  it('general_manager can view an expense attachment despite lacking accounting.expense.create (real view-not-manage asymmetry)', async () => {
    const res = await withSession(generalManagerCookie, () => getAttachment(getRequest(expenseAttachmentId), { params: Promise.resolve({ id: expenseAttachmentId }) }))
    expect(res.status).toBe(200)
  })

  it('hr_admin cannot view an expense attachment (lacks accounting.expense.view entirely)', async () => {
    const res = await withSession(hrAdminCookie, () => getAttachment(getRequest(expenseAttachmentId), { params: Promise.resolve({ id: expenseAttachmentId }) }))
    expect(res.status).toBe(403)
  })

  it('the uploading doctor can retrieve the lab-result scan', async () => {
    const res = await withSession(doctorCookie, () => getAttachment(getRequest(labAttachmentId), { params: Promise.resolve({ id: labAttachmentId }) }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('nurse can view the lab-result scan despite lacking clinical.lab.results.enter (real view-not-manage asymmetry)', async () => {
    const res = await withSession(nurseCookie, () => getAttachment(getRequest(labAttachmentId), { params: Promise.resolve({ id: labAttachmentId }) }))
    expect(res.status).toBe(200)
  })

  it('returns 404 for a nonexistent attachment id', async () => {
    const res = await withSession(financeAdminCookie, () => getAttachment(getRequest('does-not-exist'), { params: Promise.resolve({ id: 'does-not-exist' }) }))
    expect(res.status).toBe(404)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await withSession(null, () => getAttachment(getRequest(expenseAttachmentId), { params: Promise.resolve({ id: expenseAttachmentId }) }))
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 3: Run the test file to verify the new tests fail**

Run: `npx vitest run tests/integration/attachments.test.ts`
Expected: FAIL on the new `describe('GET /api/attachments/[id]', ...)` block — `Cannot find module '@/app/api/attachments/[id]/route'` — before Step 1 of this task exists. If Step 1 was already applied first, confirm instead that these specific new assertions would fail against a stub/incorrect implementation, and note in your report which order you used.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: All tests passing, including both the Task 1 upload suite and this task's retrieval suite. Report the final total.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/attachments/\[id\]/route.ts tests/integration/attachments.test.ts
git commit -m "feat(attachments): add retrieval route, gated on the related record's view capability"
```

- [ ] **Step 6: Live verification**

1. Attempt browser automation first (it has connected for the last three consecutive phases). Since there's no UI for this phase, "live verification" here means an HTTP-level, real-`erp-lfd`-data check, not a click-through — mint real session cookies (Admin-SDK custom-token exchange, same pattern used for Phase 29's live verification) for a real `finance_admin` and a real `doctor`/`lab_staff` account, and:
   - Upload a real small PDF to a real expense via `POST /api/attachments` against the real dev server, confirm 201 and a real Storage object exists (check via the Firebase console or `bucket.file(path).exists()` from a one-off script) and a real Firestore `attachments` doc exists with the correct fields.
   - Retrieve it via `GET /api/attachments/[id]`, confirm the bytes round-trip correctly and `Content-Type` is `application/pdf`.
   - Confirm a role without `accounting.expense.view` (e.g. `hr_admin` or `it_admin`) gets 403 on the same retrieval.
   - Confirm rejection of a `.txt` file and an oversized file against the real server, not just the emulator.
2. If browser automation and/or real-Storage access is unreachable this session, fall back to the emulator test suite's evidence (Task 1/2's 16 tests already exercise the full real upload-then-retrieve cycle against the Storage emulator) and say so explicitly in the completion report — do not claim live verification happened if it didn't.
3. Clean up: delete the real test expense/lab-order/lab-result/attachment records created during live verification, the same standing practice this project follows for synthetic live-verification data, unless a full cleanup isn't possible in which case name what's left behind (matching how Phase 13's synthetic test customer was explicitly flagged rather than silently left).

---

## Self-Review

**Spec coverage:**
- Generic `relatedCollection`/`relatedDocId` attachment model, no bespoke fields on `labResults`/`expenses` → Task 1 Steps 2, 5 (attachments doc shape; no edits to `labResult.ts`/`expense.ts` anywhere in this plan).
- Storage rules fully closed, all access through the two routes → Task 1 Steps 6-8.
- Upload gated on manage/create capability looked up from the actual capability map, related doc existence checked, file type/size validated with clear errors → Task 1 Step 5, tested in Step 12.
- Retrieval gated on view capability, an attachment never independently more/less visible than its related record → Task 2 Step 1, tested in Step 2 (the two real view-not-manage asymmetries explicitly exercised).
- Real upload-then-retrieve cycle verified directly → Task 2 Step 2's first test does exactly this against the emulator; Task 2 Step 6 attempts it again live.
- No UI changes → confirmed by the File Structure's explicit "Explicitly untouched" list; no component file appears in either task.

**Placeholder scan:** none — every step has complete, runnable code.

**Type consistency:** `AttachableCollection`/`ATTACHMENT_CAPABILITIES` (Task 1) are imported by exact name into Task 2's route with no renaming. `Attachment`'s field names (`relatedCollection`, `relatedDocId`, `storagePath`, `fileName`, `mimeType`, `sizeBytes`, `uploadedBy`, `branchId`, `createdAt`) match what both routes actually read/write — no drift between the type declaration and the two routes' literal object shapes.
