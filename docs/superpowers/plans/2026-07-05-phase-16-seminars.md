# Phase 16 — Health Seminars & Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seminar events and attendance recording — the fourth clinical-adjacent collection pair — plus the new `protocol` role, with a genuinely three-way capability split (`seminars.manage` / `seminars.attendance.record` / `seminars.attendance.view`) that cannot collapse into any existing role-list constant.

**Architecture:** Two new collections, `seminars` (one per event) and `seminarAttendance` (one per attendee-per-seminar), both fully closed in Firestore rules, same treatment as `treatments`/`appointments`/`labOrders`/`labResults`. Unlike every prior clinical capability, none of the three new capabilities reuse `CLINICAL_ROLES`/`CLINICAL_VIEW_ROLES` by reference — the role sets are genuinely disjoint from the existing clinical wall (`protocol` and `admin` appear here but not there), so three new constants are introduced. A shared `getSeminarAttendance` helper (filterable by `seminarId` or `customerId`) is the single audit-logged call site for viewing attendance, mirroring `getAppointments`/`getLabRecords`. Recording attendance and creating/editing a seminar are plain creates/updates — no transaction-critical write exists in this phase (unlike Phase 14's overlap check or Phase 15's result-entry transaction), since nothing here has an atomicity requirement across two related writes. The customer detail page's `ClinicalSection.tsx` gets its seminar-attendance placeholder replaced with real data, but — a first for this file — the new subsection needs its own visibility gate independent of `clinical.record.view`, since `protocol` and `admin` can see seminar attendance without being able to see treatments.

**Tech Stack:** Same as the rest of the app — Next.js Server Components + API routes, Firebase Admin SDK, Firestore. No unit test suite in this project (confirmed convention through Phases 13–15) — verification per task is `npx tsc --noEmit` clean plus confirming imported signatures against live source; the phase closes with live verification against real `erp-lfd` data, gated on the user's explicit go-ahead.

## Global Constraints

- No recurring seminars, no per-patient required-attendance tracking based on treatment plans, no capacity limits — explicitly out of scope per the brief; do not build toward any of them.
- `seminarAttendance.method` is never cross-validated against the seminar's own `format` — recorded as given, matching this app's established "record the claim, don't verify it" pattern (see payments in CLAUDE.md). A hybrid seminar can have both `physical` and `online` attendees by design; this plan does not restrict method for `physical`-only or `online`-only seminars either.
- `seminars`/`seminarAttendance`: no direct client read or write in Firestore rules — same closed pattern as `treatments`/`appointments`/`labOrders`/`labResults`.
- Viewing seminar attendance must produce its own audit log entry, `seminar_attendance_view`, via one shared call site — the same "true by construction" discipline as `getPatientTreatments`/`getAppointments`/`getLabRecords`. Browsing the seminar event list/detail itself (title, date, format — logistics, not clinical/PII data) is **not** separately audit-logged; the brief calls out attendance specifically, not seminar metadata.
- The customer detail page's existing Purchase History, Clinical record, Upcoming appointments, and Lab orders sections must be provably unchanged — diffed against the pre-phase version, same standard every phase since Phase 9 has been held to.
- `general_manager` doesn't exist in `ROLES` yet — not added to any of the three new role-list constants now, same retrofit-later note as every clinical capability before it.

## Decisions requiring your sign-off before implementation

### 1. Three new role-list constants — none reusable from existing ones

The brief is explicit that `seminars.attendance.view`'s list (`doctor`, `medical_secretary`, `protocol`, `admin`, `super_admin`) must not reuse `CLINICAL_VIEW_ROLES` by reference, since it includes `protocol`/`admin` which the stricter clinical wall deliberately excludes. The same is true in the other direction for `seminars.manage` (`medical_secretary`, `admin`, `super_admin` — no `doctor`, no `protocol`) and `seminars.attendance.record` (`protocol`, `admin`, `super_admin` — no `medical_secretary`, no `doctor`): neither matches `CLINICAL_ROLES`, `CLINICAL_VIEW_ROLES`, `CRM_VIEW_ROLES`, or any other existing constant in `permissions.ts`. This plan adds three new constants — `SEMINAR_MANAGE_ROLES`, `SEMINAR_RECORD_ROLES`, `SEMINAR_VIEW_ROLES` — each spelled out explicitly rather than composed from existing ones, since composing them (e.g. `[...CRM_VIEW_ROLES, 'protocol']`) would silently inherit unrelated roles (`branch_manager`, `cashier`) the moment CRM_VIEW_ROLES changes for an unrelated reason.

**Resolved as above unless you object.**

### 2. `protocol` is a plain client-SDK, org-wide role — same login/branch treatment as `doctor`/`medical_secretary`

Not added to `STRICT_AUDIT_ROLES` (server-verified login path) — no basis in the brief for treating its login as a higher-value security signal than `doctor`'s. Not added to `BRANCH_LOCKED_ROLES` — attendance recording is explicitly org-wide per the brief, so there's no reason to pin `protocol` to a single branch the way `branch_manager`/`cashier` are pinned. This means `protocol`'s login and branch-scoping require zero code changes beyond adding it to the `ROLES` array — both `STRICT_AUDIT_ROLES.includes(role)` and `isBranchLocked(role)` are already data-driven.

**Resolved as above unless you object.**

### 3. `seminars.manage`'s `branchId` handling doesn't need `isBranchLocked()` — none of its roles are branch-locked

CLAUDE.md's Phase 8 fix pattern (`isBranchLocked(role)` deciding whether an explicit `branchId` in the request body is honored) exists to stop a branch-locked role from picking a foreign branch. `seminars.manage` is granted to `medical_secretary`, `admin`, `super_admin` — none of which are branch-locked. So `POST /api/seminars` simply requires an explicit `branchId` when `format !== 'online'`, validated against a real `branches` doc, with no role-based override logic needed. This isn't a shortcut around the pattern — the pattern's precondition (a branch-locked role might reach this handler) never holds here, since `isBranchLocked` is called out in CLAUDE.md specifically for routes a branch-locked role can reach.

**Resolved as above unless you object.**

### 4. Audit action naming: `seminar_create` / `seminar_edit` / `seminar_attendance_record` / `seminar_attendance_view`

Following the emerging verb-object convention (`lab_order_create`, `appointment_view`) rather than the shorter `lab_view`/`appointment_view` style, since "seminar" alone is ambiguous between the event and the attendance record, and only attendance viewing needs an audit trail per the brief — naming it `seminar_attendance_view` (not `seminar_view`) keeps that distinction visible in the audit log itself.

**Resolved as above unless you object.**

### 5. `seminars.manage`'s "edit" half gets minimal support: `PATCH /api/seminars/[id]` + an inline edit form

The brief defines `seminars.manage` as "create/edit the seminar event itself." The exit criteria don't test editing directly, but granting a capability whose own name promises edit access and then building none of it would be a real gap, not a deferred nice-to-have. This plan builds the minimum: `PATCH /api/seminars/[id]` accepting `title`/`description`/`scheduledAt`/`format`/`branchId`, and a `mode="edit"` variant of the same `SeminarForm` component used for creation, toggled inline on the seminar detail page — no separate `/seminars/[id]/edit` route.

**Resolved as above unless you object.**

### 6. No Cloud Function notification trigger this phase

Every prior clinical collection (`appointments`, `labResults`) got a notification trigger because there was an obvious recipient (the assigned doctor). Nothing in this brief names a notification requirement, and there's no obvious recipient for "attendance was recorded against a seminar" — the actor recording it already knows. Flagging this rather than silently building one or silently deciding not to.

**Resolved as above unless you object — if you want one (e.g. notifying `seminars.manage` holders when attendance crosses some count), say so and this plan will be revised before execution.**

### 7. `getSeminarAttendance` needs two composite indexes, not one

The helper is filterable by either `seminarId` (seminar detail page's attendee list) or `customerId` (customer detail page's attendance history), each combined with `orderBy('recordedAt', 'desc')` — mirroring `getAppointments`' two-index precedent (`doctorUid`+`scheduledAt`, `customerId`+`status`+`scheduledAt`). Both index entries are added in Task 2.

**Resolved as above unless you object.**

---

## Task 1: Permissions, roles, types, audit actions

**Review tier: Opus** (capability grant, matching this project's unwavering practice — every capability-grant task has been Opus-reviewed: Phase 13's Task 1, Phase 13.1's only task, Phase 14's Task 1, Phase 15's Task 1).

**Files:**
- Modify: `src/lib/auth/permissions.ts`
- Modify: `src/lib/types/audit.ts`
- Create: `src/lib/types/seminar.ts`
- Create: `src/lib/types/seminarAttendance.ts`

**Interfaces:**
- Produces: `RoleId` now includes `'protocol'`. `Capability` now includes `'seminars.manage'` and `'seminars.attendance.record'` (`'seminars.attendance.view'` already existed, reserved in Phase 13.1, currently mapped to `[]`). `AuditAction` now includes `'seminar_create' | 'seminar_edit' | 'seminar_attendance_record' | 'seminar_attendance_view'`. New types `Seminar`, `SeminarFormat`, `SeminarAttendance`, `AttendanceMethod`.

- [ ] **Step 1: Add `protocol` to `ROLES`**

In `src/lib/auth/permissions.ts`, change:

```ts
export const ROLES = [
  'super_admin', 'admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin', 'cashier', 'doctor', 'medical_secretary',
] as const
```

to:

```ts
export const ROLES = [
  'super_admin', 'admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin', 'cashier', 'doctor', 'medical_secretary', 'protocol',
] as const
```

- [ ] **Step 2: Add the new capabilities to the `Capability` union and `CAPABILITY_MODULE`**

Change the `Capability` union's clinical/seminars lines from:

```ts
  | 'clinical.record.create' | 'clinical.record.view'
  | 'clinical.appointments.manage'
  | 'clinical.lab.manage' | 'clinical.lab.view'
  | 'seminars.attendance.view'
```

to:

```ts
  | 'clinical.record.create' | 'clinical.record.view'
  | 'clinical.appointments.manage'
  | 'clinical.lab.manage' | 'clinical.lab.view'
  | 'seminars.manage'
  | 'seminars.attendance.record' | 'seminars.attendance.view'
```

Change `CAPABILITY_MODULE`'s matching entry from:

```ts
  'seminars.attendance.view': 'seminars',
```

to:

```ts
  'seminars.manage': 'seminars',
  'seminars.attendance.record': 'seminars',
  'seminars.attendance.view': 'seminars',
```

- [ ] **Step 3: Add the three new role-list constants**

Immediately after the existing `CLINICAL_VIEW_ROLES` block (after line 112 in the current file), add:

```ts
// Seminars is genuinely disjoint from the clinical wall above — protocol
// and admin both appear here but neither appears in CLINICAL_ROLES/
// CLINICAL_VIEW_ROLES, and medical_secretary/doctor split across manage
// vs record in the opposite way they split for lab. None of these three
// lists may be composed from CLINICAL_ROLES/CLINICAL_VIEW_ROLES/
// CRM_VIEW_ROLES — each is spelled out explicitly so it can't silently
// inherit an unrelated role change to one of those constants.
const SEMINAR_MANAGE_ROLES: RoleId[] = ['super_admin', 'admin', 'medical_secretary']
const SEMINAR_RECORD_ROLES: RoleId[] = ['super_admin', 'admin', 'protocol']
const SEMINAR_VIEW_ROLES: RoleId[] = ['super_admin', 'admin', 'doctor', 'medical_secretary', 'protocol']
```

- [ ] **Step 4: Wire the new constants into `ROLE_CAPABILITIES`**

Change:

```ts
  'seminars.attendance.view': [],
```

to:

```ts
  'seminars.manage': SEMINAR_MANAGE_ROLES,
  'seminars.attendance.record': SEMINAR_RECORD_ROLES,
  'seminars.attendance.view': SEMINAR_VIEW_ROLES,
```

- [ ] **Step 5: Add the new audit actions**

In `src/lib/types/audit.ts`, change:

```ts
  | 'lab_order_create' | 'lab_result_create' | 'lab_view'
```

to:

```ts
  | 'lab_order_create' | 'lab_result_create' | 'lab_view'
  | 'seminar_create' | 'seminar_edit' | 'seminar_attendance_record' | 'seminar_attendance_view'
```

- [ ] **Step 6: Create the `Seminar` type**

Create `src/lib/types/seminar.ts`:

```ts
export type SeminarFormat = 'physical' | 'online' | 'hybrid'

export interface Seminar {
  id: string
  title: string
  description: string | null
  scheduledAt: FirebaseFirestore.Timestamp
  format: SeminarFormat
  branchId: string | null
  createdBy: string
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 7: Create the `SeminarAttendance` type**

Create `src/lib/types/seminarAttendance.ts`:

```ts
export type AttendanceMethod = 'physical' | 'online'

export interface SeminarAttendance {
  id: string
  seminarId: string
  customerId: string
  method: AttendanceMethod
  recordedBy: string
  recordedAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors. (Existing errors, if any predate this task, are out of scope — confirm by checking `git stash` output compiles identically, or just confirm no errors reference the files touched in this task.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth/permissions.ts src/lib/types/audit.ts src/lib/types/seminar.ts src/lib/types/seminarAttendance.ts
git commit -m "feat(seminars): add protocol role, seminar capabilities, types, audit actions"
```

---

## Task 2: Firestore rules + composite indexes

**Review tier: Sonnet** (mechanical repetition of the already-proven `labOrders`/`labResults` closed-collection pattern).

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Close `seminars` and `seminarAttendance` in Firestore rules**

In `firestore.rules`, immediately after the existing `labResults` match block:

```
    match /labResults/{labResultId} {
      allow read, write: if false; // all access goes through /api/lab-results — clinical data, same fully-closed treatment as labOrders
    }
```

add:

```
    match /seminars/{seminarId} {
      allow read, write: if false; // all access goes through /api/seminars — clinical-adjacent event data, same fully-closed treatment as treatments/appointments/labOrders/labResults
    }
    match /seminarAttendance/{attendanceId} {
      allow read, write: if false; // all access goes through /api/seminar-attendance — clinical-adjacent attendance data, same fully-closed treatment as seminars, plus every read is separately audit-logged server-side
    }
```

- [ ] **Step 2: Add composite indexes**

In `firestore.indexes.json`, immediately after the existing `labOrders` index entry (before the closing `]` of `"indexes"`), add:

```json
    {
      "collectionGroup": "seminarAttendance",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "seminarId", "order": "ASCENDING" },
        { "fieldPath": "recordedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "seminarAttendance",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "customerId", "order": "ASCENDING" },
        { "fieldPath": "recordedAt", "order": "DESCENDING" }
      ]
    }
```

Do not add an index for `seminars` itself — the list page's only query is `orderBy('scheduledAt', 'desc')` with no equality filter, which Firestore's automatic single-field indexing already covers (same reasoning as Phase 15 Decision #5 for `labResults`).

- [ ] **Step 3: Verify the rules file is syntactically valid**

Run: `npx firebase deploy --only firestore:rules --dry-run` if the Firebase CLI is configured locally, otherwise visually confirm brace balance matches the existing `labResults` block exactly (copy-paste structure, only collection/route names differ).

- [ ] **Step 4: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(seminars): close seminars/seminarAttendance in Firestore rules, add composite indexes"
```

---

## Task 3: Shared `getSeminarAttendance` view/audit helper

**Review tier: Sonnet** (closely mirrors `getAppointments`/`getLabRecords`, no transaction).

**Files:**
- Create: `src/lib/clinical/getSeminarAttendance.ts`

**Interfaces:**
- Consumes: `hasCapability(role, capability)` from `@/lib/auth/permissions`; `AuthError`, `SessionUser` from `@/lib/auth/server-guard`; `writeAuditLog` from `@/lib/audit/log`; `Seminar` from `@/lib/types/seminar`; `SeminarAttendance`, `AttendanceMethod` from `@/lib/types/seminarAttendance`.
- Produces: `SeminarAttendanceRow` interface, `SeminarAttendanceFilters` interface, `getSeminarAttendance(filters, viewer): Promise<SeminarAttendanceRow[]>` — consumed by Task 4's `GET /api/seminar-attendance` and Task 5/6's pages.

- [ ] **Step 1: Write the helper**

Create `src/lib/clinical/getSeminarAttendance.ts`:

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { Seminar } from '@/lib/types/seminar'
import type { SeminarAttendance, AttendanceMethod } from '@/lib/types/seminarAttendance'

export interface SeminarAttendanceRow {
  id: string
  seminarId: string
  seminarTitle: string
  seminarScheduledAt: string
  customerId: string
  customerName: string
  method: AttendanceMethod
  recordedBy: string
  recordedByName: string
  recordedAt: string
}

export interface SeminarAttendanceFilters {
  seminarId?: string
  customerId?: string
}

// Called by GET /api/seminar-attendance, the seminar detail page's attendee
// list (Task 5), and the customer detail page's "Seminar attendance"
// subsection (Task 6) — same single-call-site-for-audit-logging discipline
// as getPatientTreatments/getAppointments/getLabRecords, so "viewing
// attendance is read-audit-logged" is true by construction. Re-checks the
// capability itself rather than trusting the caller already did, same
// belt-and-suspenders discipline as its three clinical precedents.
export async function getSeminarAttendance(
  filters: SeminarAttendanceFilters,
  viewer: SessionUser
): Promise<SeminarAttendanceRow[]> {
  if (!hasCapability(viewer.role, 'seminars.attendance.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('seminarAttendance')
  if (filters.seminarId) query = query.where('seminarId', '==', filters.seminarId)
  if (filters.customerId) query = query.where('customerId', '==', filters.customerId)
  query = query.orderBy('recordedAt', 'desc')
  const snap = await query.get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as SeminarAttendance }))
  const uniqueSeminarIds = Array.from(new Set(docs.map((d) => d.data.seminarId)))
  const uniqueCustomerIds = Array.from(new Set(docs.map((d) => d.data.customerId)))
  const uniqueRecordedByUids = Array.from(new Set(docs.map((d) => d.data.recordedBy)))

  const [seminarDocs, customerDocs, recordedByDocs] = await Promise.all([
    Promise.all(uniqueSeminarIds.map((id) => db.collection('seminars').doc(id).get())),
    Promise.all(uniqueCustomerIds.map((id) => db.collection('customers').doc(id).get())),
    Promise.all(uniqueRecordedByUids.map((uid) => db.collection('staff').doc(uid).get())),
  ])

  const seminarInfo: Record<string, { title: string; scheduledAt: string }> = {}
  uniqueSeminarIds.forEach((id, i) => {
    const data = seminarDocs[i].data() as Seminar | undefined
    seminarInfo[id] = {
      title: data?.title ?? id,
      scheduledAt: data?.scheduledAt.toDate().toISOString() ?? '',
    }
  })
  const customerNames: Record<string, string> = {}
  uniqueCustomerIds.forEach((id, i) => {
    customerNames[id] = (customerDocs[i].data()?.name as string | undefined) ?? id
  })
  const recordedByNames: Record<string, string> = {}
  uniqueRecordedByUids.forEach((uid, i) => {
    recordedByNames[uid] = (recordedByDocs[i].data()?.name as string | undefined) ?? uid
  })

  const rows: SeminarAttendanceRow[] = docs.map(({ id, data }) => ({
    id,
    seminarId: data.seminarId,
    seminarTitle: seminarInfo[data.seminarId]?.title ?? data.seminarId,
    seminarScheduledAt: seminarInfo[data.seminarId]?.scheduledAt ?? '',
    customerId: data.customerId,
    customerName: customerNames[data.customerId] ?? data.customerId,
    method: data.method,
    recordedBy: data.recordedBy,
    recordedByName: recordedByNames[data.recordedBy] ?? data.recordedBy,
    recordedAt: data.recordedAt.toDate().toISOString(),
  }))

  await writeAuditLog({
    action: 'seminar_attendance_view',
    actorUid: viewer.uid,
    actorEmail: viewer.email,
    targetUid: filters.customerId ?? null,
    branchId: null,
    details: null,
  })

  return rows
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/clinical/getSeminarAttendance.ts
git commit -m "feat(seminars): add shared getSeminarAttendance view/audit helper"
```

---

## Task 4: API routes — seminars (create/edit/list) and seminar-attendance (record/view)

**Review tier: Opus** (this task is where the three-way capability split is actually enforced at the HTTP boundary — the highest-risk point in this phase for getting a role wrong, same reasoning this project applies to access-control work generally).

**Files:**
- Create: `src/app/api/seminars/route.ts`
- Create: `src/app/api/seminars/[id]/route.ts`
- Create: `src/app/api/seminar-attendance/route.ts`

**Interfaces:**
- Consumes: `requireCapability`, `requireAnyCapability`, `AuthError` from `@/lib/auth/server-guard`; `writeAuditLog`; `getSeminarAttendance` from Task 3; `getAdminFirestore`.
- Produces: `POST /api/seminars`, `PATCH /api/seminars/[id]`, `GET /api/seminar-attendance`, `POST /api/seminar-attendance` — consumed by Task 5's forms/pages.

- [ ] **Step 1: `POST /api/seminars` and `GET /api/seminars` (list, no audit)**

Create `src/app/api/seminars/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, requireAnyCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { SeminarFormat } from '@/lib/types/seminar'

const FORMATS: SeminarFormat[] = ['physical', 'online', 'hybrid']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// List is not audit-logged — seminar title/date/format is event logistics,
// not clinical/PII data, unlike the attendance records it hosts (see
// getSeminarAttendance). Any of the three seminars capabilities can browse
// the list; only seminars.manage can create.
export async function GET() {
  try {
    await requireAnyCapability(['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'])
    const snap = await getAdminFirestore().collection('seminars').orderBy('scheduledAt', 'desc').get()
    const rows = snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        title: data.title as string,
        description: (data.description as string | null) ?? null,
        scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
        format: data.format as SeminarFormat,
        branchId: (data.branchId as string | null) ?? null,
      }
    })
    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('seminars.manage')
    const body = await request.json()

    if (!isNonEmptyString(body.title)) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.scheduledAt)) {
      return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })
    }
    const scheduledAt = new Date(body.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 })
    }
    if (!isNonEmptyString(body.format) || !FORMATS.includes(body.format as SeminarFormat)) {
      return NextResponse.json({ error: 'format must be physical, online, or hybrid' }, { status: 400 })
    }
    const format = body.format as SeminarFormat

    let description: string | null = null
    if ('description' in body && body.description !== undefined && body.description !== null && body.description !== '') {
      if (!isNonEmptyString(body.description)) {
        return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 })
      }
      description = body.description.trim()
    }

    const db = getAdminFirestore()
    let branchId: string | null = null
    if (format === 'online') {
      if ('branchId' in body && body.branchId !== undefined && body.branchId !== null && body.branchId !== '') {
        return NextResponse.json({ error: 'branchId must not be provided for an online seminar' }, { status: 400 })
      }
    } else {
      if (!isNonEmptyString(body.branchId)) {
        return NextResponse.json({ error: 'branchId is required for a physical or hybrid seminar' }, { status: 400 })
      }
      const branchSnap = await db.collection('branches').doc(body.branchId.trim()).get()
      if (!branchSnap.exists) {
        return NextResponse.json({ error: 'branchId does not reference an existing branch' }, { status: 400 })
      }
      branchId = body.branchId.trim()
    }

    const seminarData = {
      title: body.title.trim(),
      description,
      scheduledAt,
      format,
      branchId,
      createdBy: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await db.collection('seminars').add(seminarData)

    await writeAuditLog({
      action: 'seminar_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
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

- [ ] **Step 2: `PATCH /api/seminars/[id]`**

Create `src/app/api/seminars/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { SeminarFormat } from '@/lib/types/seminar'

const FORMATS: SeminarFormat[] = ['physical', 'online', 'hybrid']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const EDITABLE_FIELDS = ['title', 'description', 'scheduledAt', 'format', 'branchId'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('seminars.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('seminars').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    const body = await request.json()

    if ('title' in body && !isNonEmptyString(body.title)) {
      return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
    }
    if ('scheduledAt' in body) {
      if (!isNonEmptyString(body.scheduledAt) || Number.isNaN(new Date(body.scheduledAt).getTime())) {
        return NextResponse.json({ error: 'scheduledAt must be a valid date' }, { status: 400 })
      }
    }
    if ('format' in body && (!isNonEmptyString(body.format) || !FORMATS.includes(body.format as SeminarFormat))) {
      return NextResponse.json({ error: 'format must be physical, online, or hybrid' }, { status: 400 })
    }
    if ('description' in body && body.description !== null && !isNonEmptyString(body.description)) {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 })
    }

    const nextFormat = ('format' in body ? body.format : existing.format) as SeminarFormat

    if ('branchId' in body || 'format' in body) {
      if (nextFormat === 'online') {
        if ('branchId' in body && body.branchId !== null && body.branchId !== '') {
          return NextResponse.json({ error: 'branchId must not be set for an online seminar' }, { status: 400 })
        }
      } else {
        const candidateBranchId = 'branchId' in body ? body.branchId : existing.branchId
        if (!isNonEmptyString(candidateBranchId)) {
          return NextResponse.json({ error: 'branchId is required for a physical or hybrid seminar' }, { status: 400 })
        }
        const branchSnap = await db.collection('branches').doc(candidateBranchId.trim()).get()
        if (!branchSnap.exists) {
          return NextResponse.json({ error: 'branchId does not reference an existing branch' }, { status: 400 })
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'title') {
        updates.title = body.title.trim()
      } else if (field === 'scheduledAt') {
        updates.scheduledAt = new Date(body.scheduledAt)
      } else if (field === 'format') {
        updates.format = body.format
      } else if (field === 'description') {
        updates.description = isNonEmptyString(body.description) ? body.description.trim() : null
      } else if (field === 'branchId') {
        updates.branchId = nextFormat === 'online' ? null : (body.branchId as string).trim()
      }
    }
    if (nextFormat === 'online') updates.branchId = null

    await docRef.update(updates)

    await writeAuditLog({
      action: 'seminar_edit',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 3: `GET /api/seminar-attendance` and `POST /api/seminar-attendance`**

Create `src/app/api/seminar-attendance/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { getSeminarAttendance } from '@/lib/clinical/getSeminarAttendance'
import type { AttendanceMethod } from '@/lib/types/seminarAttendance'

const METHODS: AttendanceMethod[] = ['physical', 'online']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET(request: Request) {
  try {
    const user = await requireCapability('seminars.attendance.view')
    const { searchParams } = new URL(request.url)
    const seminarId = searchParams.get('seminarId')
    const customerId = searchParams.get('customerId')
    const rows = await getSeminarAttendance(
      { seminarId: seminarId ?? undefined, customerId: customerId ?? undefined },
      user
    )
    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('seminars.attendance.record')
    const body = await request.json()

    if (!isNonEmptyString(body.seminarId)) {
      return NextResponse.json({ error: 'seminarId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.method) || !METHODS.includes(body.method as AttendanceMethod)) {
      return NextResponse.json({ error: 'method must be physical or online' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const seminarId = body.seminarId.trim()
    const customerId = body.customerId.trim()

    const seminarSnap = await db.collection('seminars').doc(seminarId).get()
    if (!seminarSnap.exists) {
      return NextResponse.json({ error: 'seminarId does not reference an existing seminar' }, { status: 400 })
    }
    const customerSnap = await db.collection('customers').doc(customerId).get()
    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
    }

    const docRef = await db.collection('seminarAttendance').add({
      seminarId,
      customerId,
      method: body.method as AttendanceMethod,
      recordedBy: user.uid,
      recordedAt: new Date(),
    })

    await writeAuditLog({
      action: 'seminar_attendance_record',
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

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/seminars src/app/api/seminar-attendance
git commit -m "feat(seminars): add seminar and seminar-attendance API routes"
```

---

## Task 5: UI — Sidebar nav, seminars list/new/detail pages, forms

**Review tier: Sonnet** (UI, mechanical relative to existing appointments/lab component patterns).

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Create: `src/components/seminars/SeminarForm.tsx`
- Create: `src/components/seminars/AttendanceForm.tsx`
- Create: `src/components/seminars/AttendanceTable.tsx`
- Create: `src/app/(dashboard)/seminars/page.tsx`
- Create: `src/app/(dashboard)/seminars/new/page.tsx`
- Create: `src/app/(dashboard)/seminars/[id]/page.tsx`

**Interfaces:**
- Consumes: `getSeminarAttendance` (Task 3), `/api/seminars`, `/api/seminars/[id]`, `/api/seminar-attendance` (Task 4).

- [ ] **Step 1: Generalize `NavLink` to accept multiple capabilities and add the Seminars entry**

In `src/components/layout/Sidebar.tsx`, add a new icon after `StethoscopeIcon`:

```tsx
const MegaphoneIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M3 10v4h3l7 4V6l-7 4H3z" />
    <path d="M15 8.5a3.5 3.5 0 010 7M17.5 6a6.5 6.5 0 010 12" />
  </svg>
)
```

Change the `NavLink` interface from:

```ts
interface NavLink {
  href: string
  label: string
  capability: Capability
  icon: IconComponent
}
```

to:

```ts
interface NavLink {
  href: string
  label: string
  capability: Capability | Capability[]
  icon: IconComponent
}
```

Add to `NAV_LINKS`, after the `Appointments` entry:

```ts
  {
    href: '/seminars',
    label: 'Seminars',
    capability: ['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'],
    icon: MegaphoneIcon,
  },
```

Change the filter from:

```ts
{NAV_LINKS.filter((link) => hasCapability(role, link.capability)).map((link) => (
```

to:

```ts
{NAV_LINKS.filter((link) =>
  (Array.isArray(link.capability) ? link.capability : [link.capability]).some((c) => hasCapability(role, c))
).map((link) => (
```

- [ ] **Step 2: `SeminarForm` (create and edit)**

Create `src/components/seminars/SeminarForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SeminarFormat } from '@/lib/types/seminar'

export interface SeminarFormProps {
  mode: 'create' | 'edit'
  seminarId?: string
  branches: { id: string; name: string }[]
  initial?: {
    title: string
    description: string | null
    scheduledAt: string
    format: SeminarFormat
    branchId: string | null
  }
  onDone?: () => void
}

export default function SeminarForm({ mode, seminarId, branches, initial, onDone }: SeminarFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [scheduledAt, setScheduledAt] = useState(initial?.scheduledAt ?? '')
  const [format, setFormat] = useState<SeminarFormat>(initial?.format ?? 'physical')
  const [branchId, setBranchId] = useState(initial?.branchId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      title,
      description: description.trim() || null,
      scheduledAt: new Date(scheduledAt).toISOString(),
      format,
      branchId: format === 'online' ? null : branchId,
    }

    try {
      const res = await fetch(mode === 'create' ? '/api/seminars' : `/api/seminars/${seminarId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      if (mode === 'create') {
        router.push(`/seminars/${body.id}`)
      } else {
        onDone?.()
        router.refresh()
      }
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Title</label>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Date &amp; time</label>
        <input
          required
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Format</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as SeminarFormat)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="physical">Physical</option>
          <option value="online">Online</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>
      {format !== 'online' && (
        <div>
          <label className="block text-sm font-medium text-ink">Branch</label>
          <select
            required
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            <option value="" disabled>
              Select a branch…
            </option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        {mode === 'create' ? 'Create seminar' : 'Save changes'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: `AttendanceForm`**

Create `src/components/seminars/AttendanceForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { AttendanceMethod } from '@/lib/types/seminarAttendance'

export interface AttendanceFormProps {
  seminarId: string
  customers: { id: string; name: string; phone: string }[]
  onDone: () => void
}

export default function AttendanceForm({ seminarId, customers, onDone }: AttendanceFormProps) {
  const [customerId, setCustomerId] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [method, setMethod] = useState<AttendanceMethod>('physical')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const customerQuery = customerSearch.trim().toLowerCase()
  const filteredCustomers = customerQuery
    ? customers.filter((c) => c.name.toLowerCase().includes(customerQuery) || c.phone.toLowerCase().includes(customerQuery))
    : customers

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/seminar-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seminarId, customerId, method }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      setCustomerId('')
      setCustomerSearch('')
      setSubmitting(false)
      onDone()
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Customer</label>
        <input
          value={customerSearch}
          onChange={(e) => setCustomerSearch(e.target.value)}
          placeholder="Search name or phone…"
          className="mb-2 w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
        <select
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="" disabled>
            Select a customer…
          </option>
          {filteredCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.phone})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Attended via</label>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as AttendanceMethod)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="physical">Physical</option>
          <option value="online">Online</option>
        </select>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        Record attendance
      </button>
    </form>
  )
}
```

- [ ] **Step 4: `AttendanceTable`**

Create `src/components/seminars/AttendanceTable.tsx`:

```tsx
import type { SeminarAttendanceRow } from '@/lib/clinical/getSeminarAttendance'

export interface AttendanceTableProps {
  rows: SeminarAttendanceRow[]
  emptyMessage: string
}

export default function AttendanceTable({ rows, emptyMessage }: AttendanceTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-md border border-mist">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-mist/40">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Customer</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Method</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Recorded by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-mist/40 transition-colors">
              <td className="px-3 py-2 text-ink">{new Date(row.recordedAt).toLocaleString()}</td>
              <td className="px-3 py-2 text-ink">{row.customerName}</td>
              <td className="px-3 py-2 text-ink">{row.method}</td>
              <td className="px-3 py-2 text-ink">{row.recordedByName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Seminars list page**

Create `src/app/(dashboard)/seminars/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAnyCapability, AuthError } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SeminarFormat } from '@/lib/types/seminar'

interface SeminarRow {
  id: string
  title: string
  scheduledAt: string
  format: SeminarFormat
  branchName: string | null
}

export default async function SeminarsPage() {
  let user
  try {
    user = await requireAnyCapability(['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'])
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const snap = await db.collection('seminars').orderBy('scheduledAt', 'desc').get()
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
  const uniqueBranchIds = Array.from(new Set(docs.map((d) => d.data.branchId as string | null).filter((v): v is string => !!v)))
  const branchDocs = await Promise.all(uniqueBranchIds.map((id) => db.collection('branches').doc(id).get()))
  const branchNames: Record<string, string> = {}
  uniqueBranchIds.forEach((id, i) => {
    branchNames[id] = (branchDocs[i].data()?.name as string | undefined) ?? id
  })

  const seminars: SeminarRow[] = docs.map(({ id, data }) => ({
    id,
    title: data.title as string,
    scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
    format: data.format as SeminarFormat,
    branchName: data.branchId ? branchNames[data.branchId as string] ?? (data.branchId as string) : null,
  }))

  const canManage = hasCapability(user.role, 'seminars.manage')

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Seminars</h1>
        {canManage && (
          <Link href="/seminars/new" className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity">
            New seminar
          </Link>
        )}
      </div>

      {seminars.length === 0 ? (
        <p className="text-sm text-slate">No seminars yet.</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-mist">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Title</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Format</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {seminars.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                  <td className="px-3 py-2 text-ink">{new Date(row.scheduledAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-ink">{row.title}</td>
                  <td className="px-3 py-2 text-ink">{row.format}</td>
                  <td className="px-3 py-2 text-ink">{row.branchName ?? '—'}</td>
                  <td className="px-3 py-2 text-ink">
                    <Link href={`/seminars/${row.id}`} className="text-marine underline-offset-2 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: New seminar page**

Create `src/app/(dashboard)/seminars/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SeminarForm from '@/components/seminars/SeminarForm'

export default async function NewSeminarPage() {
  try {
    await requireCapability('seminars.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const branchesSnap = await db.collection('branches').get()
  const branches = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">New seminar</h1>
      <SeminarForm mode="create" branches={branches} />
    </div>
  )
}
```

- [ ] **Step 7: Seminar detail page**

Create `src/app/(dashboard)/seminars/[id]/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { requireAnyCapability, AuthError } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getSeminarAttendance } from '@/lib/clinical/getSeminarAttendance'
import SeminarDetailClient from '@/components/seminars/SeminarDetailClient'
import type { Seminar } from '@/lib/types/seminar'

export default async function SeminarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let user
  try {
    user = await requireAnyCapability(['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'])
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const doc = await db.collection('seminars').doc(id).get()
  if (!doc.exists) notFound()
  const data = doc.data() as Seminar

  const canManage = hasCapability(user.role, 'seminars.manage')
  const canRecord = hasCapability(user.role, 'seminars.attendance.record')
  const canView = hasCapability(user.role, 'seminars.attendance.view')

  const [attendance, branches, customers, branchDoc] = await Promise.all([
    canView ? getSeminarAttendance({ seminarId: id }, user) : Promise.resolve([]),
    canManage ? db.collection('branches').get() : Promise.resolve(null),
    canRecord ? db.collection('customers').get() : Promise.resolve(null),
    data.branchId ? db.collection('branches').doc(data.branchId).get() : Promise.resolve(null),
  ])

  const seminar = {
    id,
    title: data.title,
    description: data.description,
    scheduledAt: data.scheduledAt.toDate().toISOString(),
    format: data.format,
    branchId: data.branchId,
    branchName: branchDoc?.exists ? (branchDoc.data()?.name as string) : null,
  }

  return (
    <SeminarDetailClient
      seminar={seminar}
      attendance={attendance}
      canManage={canManage}
      canRecord={canRecord}
      canView={canView}
      branches={branches ? branches.docs.map((d) => ({ id: d.id, name: d.data().name as string })) : []}
      customers={
        customers
          ? customers.docs.map((d) => ({ id: d.id, name: d.data().name as string, phone: d.data().phone as string }))
          : []
      }
    />
  )
}
```

- [ ] **Step 8: Seminar detail client component (info, edit toggle, attendance form toggle, attendee table)**

Create `src/components/seminars/SeminarDetailClient.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SeminarForm from './SeminarForm'
import AttendanceForm from './AttendanceForm'
import AttendanceTable from './AttendanceTable'
import type { SeminarFormat } from '@/lib/types/seminar'
import type { SeminarAttendanceRow } from '@/lib/clinical/getSeminarAttendance'

// `seminar.scheduledAt` arrives as a UTC ISO string (server-serialized via
// .toISOString()); a <input type="datetime-local"> needs local-time
// "YYYY-MM-DDTHH:mm" with no timezone conversion applied by the browser.
// A plain .slice(0, 16) on the ISO string would silently display (and, on
// resubmission, persist) the wrong instant for any timezone other than
// UTC — this reconstructs local wall-clock fields explicitly instead.
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface SeminarDetailClientProps {
  seminar: {
    id: string
    title: string
    description: string | null
    scheduledAt: string
    format: SeminarFormat
    branchId: string | null
    branchName: string | null
  }
  attendance: SeminarAttendanceRow[]
  canManage: boolean
  canRecord: boolean
  canView: boolean
  branches: { id: string; name: string }[]
  customers: { id: string; name: string; phone: string }[]
}

export default function SeminarDetailClient({
  seminar,
  attendance,
  canManage,
  canRecord,
  canView,
  branches,
  customers,
}: SeminarDetailClientProps) {
  const router = useRouter()
  const [showEdit, setShowEdit] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">{seminar.title}</h1>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowEdit((prev) => !prev)}
            className="text-marine underline-offset-2 hover:underline"
          >
            {showEdit ? 'Cancel' : 'Edit'}
          </button>
        )}
      </div>

      {showEdit ? (
        <SeminarForm
          mode="edit"
          seminarId={seminar.id}
          branches={branches}
          initial={{
            title: seminar.title,
            description: seminar.description,
            scheduledAt: toDatetimeLocalValue(seminar.scheduledAt),
            format: seminar.format,
            branchId: seminar.branchId,
          }}
          onDone={() => setShowEdit(false)}
        />
      ) : (
        <div className="space-y-1 text-sm">
          <div>
            <span className="text-slate">Date/Time:</span>{' '}
            <span className="text-ink">{new Date(seminar.scheduledAt).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate">Format:</span> <span className="text-ink">{seminar.format}</span>
          </div>
          <div>
            <span className="text-slate">Branch:</span> <span className="text-ink">{seminar.branchName ?? '—'}</span>
          </div>
          {seminar.description && (
            <div>
              <span className="text-slate">Description:</span> <span className="text-ink">{seminar.description}</span>
            </div>
          )}
        </div>
      )}

      {canView && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-ink">Attendance</h2>
          <AttendanceTable rows={attendance} emptyMessage="No attendance recorded yet." />
        </div>
      )}

      {canRecord && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowRecordForm((prev) => !prev)}
            className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
          >
            Record attendance
          </button>
          {showRecordForm && (
            <AttendanceForm
              seminarId={seminar.id}
              customers={customers}
              onDone={() => {
                setShowRecordForm(false)
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

- [ ] **Step 9: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/seminars src/app/\(dashboard\)/seminars
git commit -m "feat(seminars): add seminars UI — list, create, detail, attendance recording"
```

---

## Task 6: Customer detail page — replace the Phase 16 placeholder

**Review tier: Sonnet**, but the final whole-branch review must independently diff this file against its pre-Phase-16 state (see Execution below).

**Files:**
- Modify: `src/components/clinical/ClinicalSection.tsx`
- Modify: `src/app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `getSeminarAttendance` (Task 3).

- [ ] **Step 1: Give `ClinicalSection` its own internal gate for the treatments table, and real seminar-attendance data**

Replace the full contents of `src/components/clinical/ClinicalSection.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TreatmentForm from './TreatmentForm'
import type { TreatmentRow } from '@/lib/clinical/getPatientTreatments'
import type { SeminarAttendanceRow } from '@/lib/clinical/getSeminarAttendance'

export type { TreatmentRow }

export interface ClinicalSectionProps {
  customerId: string
  treatments: TreatmentRow[]
  canCreate: boolean
  canViewClinical: boolean
  seminarAttendance: SeminarAttendanceRow[]
  canViewSeminarAttendance: boolean
}

export default function ClinicalSection({
  customerId,
  treatments,
  canCreate,
  canViewClinical,
  seminarAttendance,
  canViewSeminarAttendance,
}: ClinicalSectionProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="space-y-3">
      {canViewClinical && (
        <>
          <h2 className="text-lg font-medium text-ink">Clinical record</h2>
          {treatments.length === 0 ? (
            <p className="text-sm text-slate">No treatments recorded yet.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-mist">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Diagnosis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {treatments.map((row) => (
                    <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                      <td className="px-3 py-2 text-ink">{row.date}</td>
                      <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                      <td className="px-3 py-2 text-ink">{row.diagnosis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canCreate && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowForm((prev) => !prev)}
                className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
              >
                Add treatment
              </button>
              {showForm && (
                <TreatmentForm
                  customerId={customerId}
                  onDone={() => {
                    setShowForm(false)
                    router.refresh()
                  }}
                />
              )}
            </div>
          )}
        </>
      )}

      {canViewSeminarAttendance && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-ink">Seminar attendance</h3>
          {seminarAttendance.length === 0 ? (
            <p className="text-sm text-slate">No seminar attendance recorded.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-mist">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Seminar</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {seminarAttendance.map((row) => (
                    <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                      <td className="px-3 py-2 text-ink">{new Date(row.seminarScheduledAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-ink">{row.seminarTitle}</td>
                      <td className="px-3 py-2 text-ink">{row.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

This is byte-identical, for any viewer where `canViewClinical` is `true` (every viewer who could reach `ClinicalSection` before this phase), to the previous treatments table and "Add treatment" block — only wrapped in a fragment gated on the now-always-true `canViewClinical` prop for those viewers. The only viewers for whom anything is different are `protocol` and `admin`, who previously could never reach this component at all.

- [ ] **Step 2: Wire the new props through from the customer detail page**

In `src/app/(dashboard)/customers/[id]/page.tsx`, add an import:

```ts
import { getSeminarAttendance } from '@/lib/clinical/getSeminarAttendance'
```

After the existing:

```ts
  const labOrders = canViewLab ? await getLabRecords(id, user) : []
  const treatments = canViewClinical ? await getPatientTreatments(id, user) : []
```

add:

```ts
  const canViewSeminarAttendance = hasCapability(user.role, 'seminars.attendance.view')
  const seminarAttendance = canViewSeminarAttendance
    ? await getSeminarAttendance({ customerId: id }, user)
    : []
```

Change:

```tsx
      {canViewClinical && (
        <ClinicalSection customerId={id} treatments={treatments} canCreate={canCreateTreatment} />
      )}
```

to:

```tsx
      {(canViewClinical || canViewSeminarAttendance) && (
        <ClinicalSection
          customerId={id}
          treatments={treatments}
          canCreate={canCreateTreatment}
          canViewClinical={canViewClinical}
          seminarAttendance={seminarAttendance}
          canViewSeminarAttendance={canViewSeminarAttendance}
        />
      )}
```

Nothing else in this file changes — the Purchase History, Upcoming appointments, and Lab orders sections, and everything above the `ClinicalSection` invocation, are untouched.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Diff-check the untouched sections**

Run: `git diff src/app/\(dashboard\)/customers/\[id\]/page.tsx`
Expected: the only hunks touch the import block, the two new lines computing `canViewSeminarAttendance`/`seminarAttendance`, and the `ClinicalSection` invocation itself — nothing in the Purchase History, Upcoming appointments, or Lab orders JSX blocks appears in the diff.

- [ ] **Step 5: Commit**

```bash
git add src/components/clinical/ClinicalSection.tsx "src/app/(dashboard)/customers/[id]/page.tsx"
git commit -m "feat(seminars): replace ClinicalSection's seminar-attendance placeholder with real data"
```

---

## Task 7: Resolve the fifth TD-3 check — `seminarAttendance`

**Review tier: Sonnet** (mechanical repetition of the already-proven pattern, fourth time).

**Files:**
- Modify: `src/app/api/customers/[id]/route.ts`

- [ ] **Step 1: Add the fifth existence check to `DELETE`**

Immediately after the existing `labOrders` check and before `await docRef.delete()`:

```ts
    const labOrdersSnap = await db.collection('labOrders').where('customerId', '==', id).limit(1).get()
    if (!labOrdersSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a lab order' }, { status: 409 })
    }
```

add:

```ts
    const seminarAttendanceSnap = await db.collection('seminarAttendance').where('customerId', '==', id).limit(1).get()
    if (!seminarAttendanceSnap.empty) {
      return NextResponse.json({ error: 'Cannot delete a customer that is still referenced by a seminar attendance record' }, { status: 409 })
    }
```

Nothing else in this file changes — the `PATCH` handler above `DELETE` is untouched. `DeleteCustomerButton.tsx` already surfaces any non-2xx response's `error` message generically — no UI change needed for this task.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/customers/[id]/route.ts"
git commit -m "fix(crm): extend TD-3 customer-deletion guard to seminarAttendance (fifth check)"
```

---

## Execution

Seven tasks, in order (1 → 2 → 3 → 4 → 5 → 6 → 7 — each depends on the previous; Task 7 has no dependency on Tasks 2–6 and could run any time after Task 2's rules update, but keep it sequential unless you're confident in the parallelization). **Tasks 1 and 4 get Opus review** (capability grant, and the HTTP-boundary enforcement of the new three-way split); **Tasks 2, 3, 5, 6, 7 get Sonnet-tier review**, matching this project's established practice. Final whole-branch review also on Opus, specifically re-checking:

- `SEMINAR_MANAGE_ROLES` is exactly `['super_admin', 'admin', 'medical_secretary']`, `SEMINAR_RECORD_ROLES` is exactly `['super_admin', 'admin', 'protocol']`, `SEMINAR_VIEW_ROLES` is exactly `['super_admin', 'admin', 'doctor', 'medical_secretary', 'protocol']` — confirmed by direct comparison against the brief, not just visual similarity, and confirmed none of the three constants was composed from `CLINICAL_ROLES`/`CLINICAL_VIEW_ROLES`/`CRM_VIEW_ROLES` by reference.
- Every role *not* in the relevant list gets 403 on `POST /api/seminars`, `PATCH /api/seminars/[id]`, `POST /api/seminar-attendance`, and `GET /api/seminar-attendance` — verified by direct API call for `protocol` (should get 403 on seminars create/edit, 200 on attendance record, 200 on attendance view), `medical_secretary` (200 on seminars create/edit, 403 on attendance record, 200 on attendance view), `doctor` (403 on seminars create/edit, 403 on attendance record, 200 on attendance view), and at least one uninvolved role (e.g. `cashier` or `finance_admin`, 403 on all four).
- `seminars`/`seminarAttendance` have zero client-reachable paths in `firestore.rules`.
- Every code path that lists seminar attendance (the seminar detail page, the customer detail page's new subsection, and `GET /api/seminar-attendance`) goes through `getSeminarAttendance` and therefore writes exactly one `seminar_attendance_view` entry per call — no read path bypasses it. Confirm the seminar event list/detail itself (title/date/format) does *not* write any audit entry, per Decision #4.
- `customers/[id]/page.tsx`'s diff touches only what Task 6 describes — Purchase History, Clinical record (structurally, for any viewer with `canViewClinical: true`), Upcoming appointments, and Lab orders sections byte-identical to their pre-Phase-16 state.
- `ClinicalSection.tsx`'s treatments-table JSX is byte-identical to its pre-Phase-16 version for any render where `canViewClinical` is `true` — confirm by tracing the diff, not by re-reading the new file in isolation.
- `DELETE /api/customers/[id]` blocks independently on each of `sales`/`treatments`/`appointments`/`labOrders`/`seminarAttendance` — verify all five checks individually (a customer referenced by *only* a seminar attendance record, nothing else, still gets blocked with the seminar-specific message), not just that the code compiles.
- `Sidebar.tsx`'s `NavLink.capability` generalization to `Capability | Capability[]` doesn't change filtering behavior for any existing nav link (every existing entry still passes a single `Capability`, not an array) — confirm by checking the `.some(...)` filter degrades correctly for a single-capability array of length 1.

**Live verification** (needs the user's explicit go-ahead before writing any real data to `erp-lfd`, per this project's standing test-data policy): create one real `protocol`-role staff account (following the same account-creation flow used for prior clinical roles); using existing real accounts where possible (the real doctor/medical_secretary/admin/branch_manager/cashier/finance_admin accounts from Phases 8/13/13.1/14/15), schedule a real seminar as `medical_secretary`; confirm `doctor`/`protocol` get 403 on `POST /api/seminars`; record attendance against it as `protocol` for at least one real customer with `method: 'physical'` and a second with `method: 'online'`; confirm `medical_secretary`/`doctor` get 403 on `POST /api/seminar-attendance`; confirm `doctor`/`medical_secretary`/`protocol`/`admin` can all view attendance (`GET /api/seminar-attendance` and the seminar detail page) while `branch_manager`/`cashier`/`finance_admin`/`hr_admin`/`it_admin` get 403/don't see the nav link; confirm the customer detail page's "Seminar attendance" subsection shows the recorded rows for `protocol`/`admin` (who have no other clinical section visible) and for `doctor`/`medical_secretary`/`super_admin` (alongside their other clinical sections); confirm `auditLogs` shows the expected `seminar_create`/`seminar_attendance_record`/`seminar_attendance_view` sequence with no duplicate or missing entries, and confirm no `seminar_view`-type entry was written just from browsing the seminars list; attempt to delete a customer referenced only by a seminar attendance record (create a fresh test customer for this, to isolate the new check per this project's established practice, not reusing an existing test customer already blocked by other references) and confirm it's now blocked with the seminar-attendance-specific message.

**Completion report** matching Phases 13–15's level of detail: commit hashes, file/line counts, explicit confirmation of every "do not touch" item, the capability-footprint comparison for all three new role lists against the brief, a note on all seven flagged decisions above and how they held up under review, and explicit confirmation of the exit criteria: seminar creation + both attendance methods work; the three-way role boundary (`protocol`/`medical_secretary`/`doctor`) verified via direct API call in each direction; attendance viewing is audit-logged; the customer detail page's four pre-existing sections are diff-confirmed unchanged; TD-3 now blocks on five collections independently; `seminars`/`seminarAttendance` are fully closed in Firestore rules.
