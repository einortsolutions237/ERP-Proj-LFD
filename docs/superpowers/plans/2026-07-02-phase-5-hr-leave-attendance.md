# Phase 5 — HR (Leave & Attendance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff can submit and track their own leave requests and clock in/out daily; branch_manager/hr_admin/admin/super_admin can review and approve/reject leave and view attendance, scoped to their authority, with self-approval structurally impossible.

**Architecture:** Same modular monolith as Phases 1–4. Two new collections (`leaveRequests`, `attendanceRecords`), both branch-scoped (a genuine departure from Phase 4's org-wide `customers` pattern — see CLAUDE.md's new "HR — leave & attendance" section, added as part of this planning pass). No change to any existing collection, route, or type — this phase is fully additive.

**Tech Stack:** Unchanged — Next.js App Router, TypeScript, Tailwind, Firebase Auth + Firestore + Admin SDK.

## Global Constraints

- Firestore rules default-deny; both new collections get `allow read, write: if false` — **fully closed, not the open-read pattern** `products`/`customers`/`sales` use. All access goes through Admin-SDK-backed API routes.
- Every write goes through an Admin-SDK-backed API route with an explicit field whitelist — never `{...body}` spread.
- Firebase custom claims (`role`, `branchId`) are the sole source of truth for authorization and for whose branch a request/check-in belongs to.
- Self-approval prevention is an explicit server-side equality check (`staffId === reviewer.uid`), never a UI-only omission, and holds for every role including `super_admin`.
- Every leave create/approve/reject and attendance check-in/check-out produces an audit log entry.
- No TDD / no automated test suite — manual verification against exit criteria, matching Phases 1–4.
- Out of scope, flag rather than guess if touched: payroll, recruitment, performance reviews, disciplinary records, leave-balance/accrual calculations.
- Known issue check: `docs/tech-debt.md` TD-1 (thin audit `details` on `product_edit`/`service_edit`/`supplier_edit`/`customer_create`) — this phase touches none of those four files. TD-1 is left alone; re-flagged as untouched in the completion report per the standing instruction, not silently dropped.

---

## Data model

### `leaveRequests/{id}` — branch-scoped, auto-ID

```ts
{
  staffId: string          // == Firebase Auth uid, same identity staff docs use
  branchId: string         // copied from requester's custom claims at request time
  type: 'annual' | 'sick' | 'unpaid' | 'other'
  startDate: Timestamp
  endDate: Timestamp
  reason: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy: string | null    // reviewer's uid
  reviewedAt: Timestamp | null
  reviewNote: string | null
  createdAt: Timestamp
}
```

### `attendanceRecords/{staffId}_{date}` — branch-scoped, **deterministic doc ID**

```ts
{
  staffId: string
  branchId: string
  date: string              // 'YYYY-MM-DD', server-computed (UTC calendar date — see open question below)
  status: 'checked_in' | 'checked_out'   // explicit state, not inferred from checkOutAt presence
  checkInAt: Timestamp
  checkOutAt: Timestamp | null
  createdAt: Timestamp
}
```

**`status` is explicit, not derived** (per your go-ahead's "make attendance transitions explicit" addition) — the only two legal transitions are doc-doesn't-exist → `checked_in` (check-in) and `checked_in` → `checked_out` (check-out), each guarded by reading `status` rather than inferring state from whether `checkOutAt` happens to be null. Same reasoning as `leaveRequests.status` existing as a real field instead of being inferred from `reviewedAt` presence.

**Why a deterministic ID (`${staffId}_${date}`), not an auto-ID + uniqueness transaction like `customers.phone`:** the "one doc per staff per day" constraint IS the doc ID here — reusing the exact composite-key pattern already used for `productStock/{branchId}_{productId}`, just applied to a new domain, rather than needing a separate uniqueness query. A duplicate check-in is then just "does this doc already exist," checked inside a transaction for the same reason every other existence-then-write in this codebase uses one (matches the phone-uniqueness and sale-void precedents) rather than relying on a raw Admin SDK "already exists" exception.

---

## Permissions (`src/lib/auth/permissions.ts`)

Two new role groupings — neither existing constant fits:

```ts
const ALL_ROLES: RoleId[] = [...ROLES]
const APPROVER_ROLES: RoleId[] = ['super_admin', 'admin', 'branch_manager', 'hr_admin']
```

Add to `Capability` union and `CAPABILITY_MODULE` (module: `'hr'`, removing `hr.*` from the placeholder comment exactly as done for prior modules):

```ts
'hr.leave.request'      // ALL_ROLES — first capability not restricted to a role group
'hr.leave.approve'      // APPROVER_ROLES
'hr.attendance.self'    // ALL_ROLES
'hr.attendance.view'    // APPROVER_ROLES
```

## Audit Actions (`src/lib/types/audit.ts`)

```ts
| 'leave_request_create' | 'leave_request_approve' | 'leave_request_reject'
| 'attendance_checkin' | 'attendance_checkout'
```

Unlike `customer_create`/etc. (`branchId: null`, org-wide entity), all five of these use the record's **real** `branchId` — leave and attendance are branch-scoped activity, the same convention `sale_create`/`sale_void` already follow.

---

## API Routes

### `src/app/api/leave-requests/route.ts`

**`POST`** — `requireCapability('hr.leave.request')`.
- Validate `type` is one of the four enum values (400 if not).
- Validate `startDate`/`endDate` are parseable dates and `endDate >= startDate` (400 if not) — accept `'YYYY-MM-DD'` strings from the client, convert to `Date` server-side, matching the staff route's `employment.startDate` conversion convention.
- `reason`: optional string-or-null, same validation shape as customers' optional fields.
- Server-derived, never client-supplied: `staffId: user.uid`, `branchId: user.branchId`, `status: 'pending'`, `reviewedBy: null`, `reviewedAt: null`, `createdAt: new Date()`.
- Audit `leave_request_create`, `branchId: user.branchId`, `details: { type, startDate, endDate }`.

**`GET`** — two modes via a query param, because the capability that gates each is different:
- `?mine=true` → `requireCapability('hr.leave.request')` (i.e., signed in — every role has this). Returns `where('staffId', '==', user.uid).orderBy('createdAt', 'desc')`.
- no `mine` param → `requireCapability('hr.leave.approve')`. Optional `?status=pending|approved|rejected` filter. `branch_manager` → `where('branchId', '==', user.branchId)` (+ status filter if present); `hr_admin`/`admin`/`super_admin` → unfiltered by branch (+ status filter if present). Always `.orderBy('createdAt', 'desc')`.

### `src/app/api/leave-requests/[id]/route.ts`

**`PATCH`** — `requireCapability('hr.leave.approve')`. Body: `{ status: 'approved' | 'rejected', reviewNote?: string | null }`. **This whole handler runs inside one `db.runTransaction`** — every check below is a read inside that transaction, and the write only happens if all of them pass, so a concurrent approval of an overlapping request can't race past this check.

- Validate `status` is `'approved'` or `'rejected'` (400, before the transaction — cheap input validation doesn't need transactional isolation).
- 404 if the doc doesn't exist.
- 409 if `existing.status !== 'pending'` (already reviewed — same "reject a second action on an already-finalized record" guard as sale-void's "already voided" check).
- **403 if `existing.staffId === user.uid`** — self-approval, checked before the branch check, holds for every role including `super_admin`. Confirmed by your go-ahead as a hard requirement.
- **403 if `user.role === 'branch_manager' && existing.branchId !== user.branchId`** — direct generalization of the exact branch-ownership guard already reviewed and shipped for `pos.sale.void`. Confirmed by your go-ahead: enforced even against a direct document ID, not just hidden from the list.
- **If the target `status` is `'approved'`: overlap check.** Query `where('staffId', '==', existing.staffId).where('status', '==', 'approved')` (pure equality-equality, no composite index needed), then in application code — not a Firestore range query, this codebase doesn't use those anywhere yet and a per-employee approved-leave set is small — check each result (excluding `existing`'s own id, same self-exclusion idiom as the customer-phone edit check) for date overlap:
  ```ts
  function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart <= bEnd && aEnd >= bStart
  }
  ```
  If any overlap is found, throw `AuthError('Overlaps an already-approved leave request for this employee', 409)`. No overlap check when rejecting — only an approval can conflict with another approval.
- Update `status`, `reviewedBy: user.uid`, `reviewedAt: new Date()`, `reviewNote: reviewNote ?? null`.
- Audit `leave_request_approve` or `leave_request_reject` (picked by the resulting status), `branchId: existing.branchId`, `details: { reviewNote }` — written after the transaction commits, same ordering every other route in this codebase already uses.

### `src/lib/attendance/today.ts` — single source of truth for "today"

```ts
// TEMPORARY: UTC calendar date, not branch-local time. There is no per-branch
// timezone concept in this app yet (see CLAUDE.md's "HR — leave & attendance"
// section and the still-open jurisdiction decision). Every attendance
// check-in/check-out/roster route calls this one function so there is exactly
// one place to fix when branch timezones become real.
export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}
```

### `src/app/api/attendance/checkin/route.ts`

**`POST`** — `requireCapability('hr.attendance.self')`.
```ts
const today = getTodayDateString()
const docRef = db.collection('attendanceRecords').doc(`${user.uid}_${today}`)
await db.runTransaction(async (tx) => {
  const snap = await tx.get(docRef)
  if (snap.exists) throw new AuthError('Already checked in today', 409)
  tx.set(docRef, { staffId: user.uid, branchId: user.branchId, date: today, status: 'checked_in', checkInAt: new Date(), checkOutAt: null, createdAt: new Date() })
})
```
Audit `attendance_checkin`, `branchId: user.branchId`.

### `src/app/api/attendance/checkout/route.ts`

**`POST`** — `requireCapability('hr.attendance.self')`.
```ts
const today = getTodayDateString()
const docRef = db.collection('attendanceRecords').doc(`${user.uid}_${today}`)
await db.runTransaction(async (tx) => {
  const snap = await tx.get(docRef)
  if (!snap.exists) throw new AuthError('No check-in found for today', 404)
  // Explicit transition guard: the only legal prior state for a check-out is
  // 'checked_in'. Reading `status` rather than inferring from `checkOutAt`
  // presence makes the state machine self-documenting and gives a checkout
  // attempted twice (or in any other state) one unambiguous rejection path.
  if (snap.data()!.status !== 'checked_in') throw new AuthError('Already checked out today', 409)
  tx.update(docRef, { status: 'checked_out', checkOutAt: new Date() })
})
```
Audit `attendance_checkout`, `branchId: user.branchId`.

### `src/app/api/attendance/me/route.ts`

**`GET`** — `requireCapability('hr.attendance.self')`. `today = getTodayDateString()`; direct `doc(`${user.uid}_${today}`).get()` — returns the record (with its `status`) or `null`. Powers the dashboard widget's "show Check In vs Check Out vs Done" decision entirely off `status`; no query, no index needed.

### `src/app/api/attendance/route.ts`

**`GET`** — `requireCapability('hr.attendance.view')`. Optional `?date=YYYY-MM-DD` (defaults to `getTodayDateString()`).
- `branch_manager` → `where('branchId', '==', user.branchId).where('date', '==', date)` — pure equality-equality, no composite index needed.
- `hr_admin`/`admin`/`super_admin` → `where('date', '==', date)` only.
- When `date` is explicitly omitted by the caller (a `?history=true` flag, distinct from "no date given"): drop the date filter entirely and `orderBy('date', 'desc')` instead, for the "historical records" requirement — `branch_manager` needs the `branchId`+`date` composite index for this path (see below); unfiltered roles need no index (single-field `orderBy` is automatic).

## Firestore Indexes (`firestore.indexes.json`)

Add four composite indexes (equality-filter + `orderBy`-on-a-different-field, per this codebase's recurring composite-index gap):

```json
{ "collectionGroup": "leaveRequests", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "staffId", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
{ "collectionGroup": "leaveRequests", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
{ "collectionGroup": "leaveRequests", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "branchId", "order": "ASCENDING" }, { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
{ "collectionGroup": "attendanceRecords", "queryScope": "COLLECTION", "fields": [
  { "fieldPath": "branchId", "order": "ASCENDING" }, { "fieldPath": "date", "order": "DESCENDING" } ] }
```

## Firestore Rules (`firestore.rules`)

```
match /leaveRequests/{requestId} {
  allow read, write: if false; // all access goes through /api/leave-requests — see CLAUDE.md's HR section for why this is closed, not open-read like products/customers
}
match /attendanceRecords/{recordId} {
  allow read, write: if false; // all access goes through /api/attendance
}
```

## Types

**`src/lib/types/leave-request.ts`**
```ts
export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'
export interface LeaveRequest {
  id: string
  staffId: string
  branchId: string
  type: LeaveType
  startDate: FirebaseFirestore.Timestamp
  endDate: FirebaseFirestore.Timestamp
  reason: string | null
  status: LeaveStatus
  reviewedBy: string | null
  reviewedAt: FirebaseFirestore.Timestamp | null
  reviewNote: string | null
  createdAt: FirebaseFirestore.Timestamp
}
```

**`src/lib/types/attendance.ts`**
```ts
export type AttendanceStatus = 'checked_in' | 'checked_out'
export interface AttendanceRecord {
  id: string
  staffId: string
  branchId: string
  date: string
  status: AttendanceStatus
  checkInAt: FirebaseFirestore.Timestamp
  checkOutAt: FirebaseFirestore.Timestamp | null
  createdAt: FirebaseFirestore.Timestamp
}
```

## Screens

**`src/app/(dashboard)/leave/page.tsx`** — "My Leave": `requireCapability('hr.leave.request')` (server component fetches own requests via `?mine=true` logic server-side directly, same as every other list page's direct-Admin-SDK-read pattern). Renders a submit form (type select, start/end date pickers, optional reason textarea) plus a table of the caller's own past requests with status badges (pending/approved/rejected) and, if reviewed, the reviewer's note.

**`src/app/(dashboard)/leave/review/page.tsx`** — "Review Leave": `requireCapability('hr.leave.approve')`. Server component fetches pending requests scoped per the GET route's branch rule. Renders a table with an inline approve/reject control per row (`LeaveReviewButtons.tsx` client component, mirroring `VoidSaleButton`'s capability-gated-control pattern) — optional note field, calls `PATCH /api/leave-requests/[id]`.

**Dashboard widget** — add `AttendanceWidget.tsx` (client component) to `src/app/(dashboard)/dashboard/page.tsx`. On mount, calls `GET /api/attendance/me` to determine state: no record today → "Check In" button; checked in, no checkout → "Check Out" button; both set → "Done for today" (disabled/read-only). One-click, no form.

**`src/app/(dashboard)/attendance/page.tsx`** — "Attendance" (approvers): `requireCapability('hr.attendance.view')`. Defaults to today's roster (`GET /api/attendance`), with a date picker and a "view history" toggle for the unfiltered/ordered historical list. Also fetches the relevant staff docs (branch-scoped for `branch_manager`, all for the org-wide roles) to build a `uid → name` lookup for display, the same join-for-display need `CheckoutForm`'s customer picker already has.

## Nav Wiring (`src/components/layout/Sidebar.tsx`)

```ts
{ href: '/leave', label: 'My Leave', capability: 'hr.leave.request' },
{ href: '/leave/review', label: 'Review Leave', capability: 'hr.leave.approve' },
{ href: '/attendance', label: 'Attendance', capability: 'hr.attendance.view' },
```
`hr.attendance.self` gets no nav link — it's the dashboard widget only, not a dedicated page.

## Build Order

1. Permissions: `ALL_ROLES`/`APPROVER_ROLES` groups, 4 new capabilities, audit actions
2. Types: `LeaveRequest`, `AttendanceRecord` (with `status`), `AttendanceStatus`
3. `src/lib/attendance/today.ts` — the shared, documented-temporary `getTodayDateString()` helper (build this before any route that needs it)
4. Leave request API — create + list (`mine` and review modes) — build and verify in isolation
5. Leave review API — approve/reject with self-approval guard, branch-ownership guard (enforced even by direct ID), and the same-employee overlap check on approval — **highest-scrutiny task this phase; the security property the whole phase is judged on. Opus-tier review for this task specifically, matching this project's practice of upgrading review rigor for the highest-stakes transaction in a phase even when it isn't a money/inventory write.**
6. Attendance check-in/check-out/me API — explicit `status` transitions (`checked_in` → `checked_out` only)
7. Attendance review API (roster + history)
8. Firestore rules: `leaveRequests` + `attendanceRecords`, both fully closed
9. Firestore indexes: the four composite indexes above
10. Screens: My Leave, Review Leave, Attendance, dashboard check-in widget
11. Nav wiring
12. Full exit-criteria verification pass — explicitly re-test self-approval with a `super_admin` account requesting their own leave, not just lower roles; explicitly test an overlap rejection and a branch_manager blocked by direct ID; confirm TD-1 untouched and re-flag it in the completion report

---

## Decisions confirmed by your go-ahead (no longer open)

- **UTC calendar date for "today"** is a documented temporary stand-in, centralized in one helper (`getTodayDateString()`) specifically so there's a single place to change when branch timezones become real — not silently accepted as permanent.
- **`branch_manager` is blocked from approving another branch's request even by direct document ID**, not just hidden from the list.
- **Overlapping-approved-leave prevention** is in scope for this phase (checked inside the approval transaction, application-code date comparison against a small equality-queried set — no Firestore range query).
- **Attendance transitions are explicit**, via a real `status` field, not inferred from `checkOutAt` presence.

## Remaining open questions / judgment calls (flagging per project convention, not guessing)

- **Firestore rules for both new collections are fully closed** (`allow read, write: if false`), not the open-read-if-authenticated pattern every other collection except `rateLimits` uses — your scope text arrived at this same conclusion mid-sentence; flagging it as a deliberate one-off since a future reader might otherwise assume it's an oversight.
- **Overlap check only blocks against other `approved` requests**, not other `pending` ones — two pending requests for the same employee can coexist and overlap; the conflict only surfaces at approval time, whichever is approved first wins and the second's approval attempt gets the 409. Not explicit in your scope text; flagging the exact boundary rather than guessing you wanted pending-vs-pending blocked too (that would block legitimate "requesting two different leave types for planning purposes before either is decided," which your scope didn't ask to prevent).
- **`docs/tech-debt.md`'s TD-1 entry doesn't yet list `customer_create`**, even though the Phase 4 audit and this project's memory both already treat it as folded in. Not this phase's work to fix (it doesn't touch any of the four files), flagging only so it doesn't look forgotten.
- Leave-balance/accrual tracking, payroll, recruitment, performance reviews, and disciplinary records are explicitly out of scope per your instruction — not touched anywhere in this plan.
- `docs/project-brief.md` still doesn't exist (same note as every prior phase) — this plan is built from your Phase 5 scope message plus `CLAUDE.md` (updated as part of this planning pass), not that file.
