# Phase 6 — In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Low-stock and leave-workflow events produce in-app notifications, without adding a single line to the four already-audited route files that cause them — a Firestore-triggered Cloud Function reacts to their writes instead.

**Architecture:** Same modular monolith for the Next.js app; this phase adds the project's **first Cloud Function** as a genuinely separate deployable (`functions/`, its own `package.json`/`tsconfig.json`/build, deployed independently via `firebase deploy --only functions`). Two new API routes (list own, mark-read) and one new `notifications` collection round out the app side.

**Tech Stack:** Firebase Functions v2 (`firebase-functions/v2/firestore`), `firebase-admin` (implicit default credentials inside the Functions runtime — no `cert()` needed there, unlike the Next.js app on Vercel). Everything else unchanged.

## Global Constraints

- `api/sales/route.ts`, `api/stock/movements/route.ts`, `api/stock/transfer/route.ts`, and `api/leave-requests/*` (both files) are **not modified anywhere in this plan**. If a task ever seems to need to touch one, stop — that's the wrong approach for this phase.
- Cloud Functions v2 API only (`firebase-functions/v2/*`), never the deprecated v1 namespace.
- Every Firestore trigger must explicitly target `database: 'default'` — this project's Firestore was provisioned with that explicit name, not the SDK's implicit `"(default)"`; omitting this option means the trigger silently never fires (see `src/lib/firebase/admin.ts`'s existing comment on the same gotcha).
- `notifications` has no `Capability` entry and no module — access is ownership-only (`recipientUid == user.uid`), checked with a bare `getSessionUser()`, not `requireCapability(...)`. This is a deliberate first-of-its-kind exception to "permissions are mapped per module" — flagged, not silent.
- Firestore rules for `notifications`: fully closed (`allow read, write: if false`), matching `leaveRequests`/`attendanceRecords` — all access through the two new API routes.
- No TDD / no automated test suite — manual verification against exit criteria, matching Phases 1–5. Cloud Functions get the same bar: no local emulator test suite is being introduced this phase; verify via `tsc`/build plus a live-fire check once deployed (deployment itself needs your go-ahead separately, since it touches the real Firebase project — see Task 3's note).
- Known issue check: `docs/tech-debt.md` TD-1 (`product_edit`/`service_edit`/`supplier_edit`/`customer_create` thin audit detail) — this phase touches none of those four files. Left alone, re-flagged in the completion report.
- External delivery (email/SMS/push), notification preferences/opt-out, and digest/batching are explicitly out of scope — flag if a task seems to need one of these, don't guess an answer.

---

## Data model

### `notifications/{id}` — personal, not branch- or org-scoped

```ts
export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed'

export interface Notification {
  id: string
  recipientUid: string
  type: NotificationType
  title: string
  body: string
  relatedId: string   // productId for low_stock; leaveRequests doc id for the other two
  read: boolean
  createdAt: FirebaseFirestore.Timestamp
}
```

**Doc ID is deterministic, not auto-ID** — `${type}_${eventId}_${recipientUid}`, where `eventId` is the triggering `stockMovements` doc's ID for `low_stock`, or the `leaveRequests` doc's ID for the other two types. Cloud Functions v2 triggers have at-least-once delivery — a retry of the *same* event must not create a *second* notification. This is why `low_stock`'s ID includes the specific movement's ID rather than just `productId`+`branchId`: a later, separate crossing event for the same product must still get its own notification.

**Idempotency is enforced with `create()`, not `set()`** (per your go-ahead) — every write uses `.create()` (or `batch.create()`), which fails with Firestore's `ALREADY_EXISTS` (gRPC status code `6`) if the doc already exists, rather than silently overwriting it. A retry of an already-processed event then fails every `create()` call with that specific error, which the handler catches and swallows (re-throwing anything else) — the strongest available guarantee that a given event produces its notification(s) *exactly once*, rather than "overwrites with the same content, probably fine." `functions/src/idempotent.ts` (Task 1) centralizes the error-check so all three triggers share one definition of "this is a harmless duplicate-create, not a real failure."

---

## `functions/` — the project's first Cloud Function

### Task 1: Scaffold the Functions project

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/.gitignore`
- Create: `functions/src/firestore.ts`
- Create: `functions/src/idempotent.ts`
- Modify: `firebase.json`

**Interfaces:**
- Produces: `functions/src/firestore.ts` exports `getFunctionsFirestore(): Firestore` — every trigger in Tasks 2-3 imports this, never re-initializes the Admin app itself.
- Produces: `functions/src/idempotent.ts` exports `isAlreadyExistsError(err: unknown): boolean` — every trigger in Tasks 2-3 uses this to swallow duplicate-`create()` errors from at-least-once retries, never re-derives the error-code check itself.

`functions/package.json`:
```json
{
  "name": "lfd-erp-functions",
  "version": "1.0.0",
  "private": true,
  "engines": { "node": "20" },
  "main": "lib/index.js",
  "scripts": {
    "build": "tsc",
    "deploy": "npm run build && firebase deploy --only functions"
  },
  "dependencies": {
    "firebase-admin": "^13.10.0",
    "firebase-functions": "^7.2.5"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```
(**Correction from an earlier version of this plan:** `firebase-functions` — even at its latest published version (7.2.5 as of this check) — has a peer dependency on `firebase-admin@^11||^12||^13`, not `^14`. It does not yet support `firebase-admin` v14 at all, so `functions/` cannot match the root app's `^14.1.0`. This is fine: `functions/` is a fully separate npm project with its own `node_modules`, and nothing requires the two admin SDK versions to match. Verified directly with `npm view firebase-functions@7.2.5 peerDependencies` before writing this — don't re-guess a version pairing without checking peer deps first.)

`functions/tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "lib": ["es2020"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```
(Deliberately self-contained under `functions/src` — does NOT reach into the root `src/` directory. See the "Open questions" section for why `APPROVER_ROLES` is duplicated here rather than imported.)

`functions/.gitignore`:
```
node_modules/
lib/
```

`functions/src/firestore.ts`:
```ts
import { initializeApp, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Inside the Cloud Functions runtime, initializeApp() with no args picks up
// the environment's implicit default credentials (unlike the Next.js app on
// Vercel, which needs an explicit cert() — see src/lib/firebase/admin.ts).
function getFunctionsApp() {
  if (getApps().length) return getApp()
  return initializeApp()
}

// This project's Firestore database has the explicit name "default", not the
// SDK's implicit "(default)" — same reason src/lib/firebase/admin.ts passes
// this second argument. Every trigger's own registration must ALSO pass
// database: 'default' in its options (Tasks 2-4) — this Firestore client
// alone is not enough to make a trigger fire against the right database.
export function getFunctionsFirestore() {
  return getFirestore(getFunctionsApp(), 'default')
}
```

`functions/src/idempotent.ts`:
```ts
// Firestore's create() rejects with this gRPC status code when the document
// already exists. Every trigger uses create() (never set()) for notification
// writes specifically so a Cloud Functions at-least-once retry of the same
// event fails loudly with exactly this error instead of silently re-writing
// — and every trigger swallows exactly this error, via this one shared
// check, rather than each re-deriving what "harmless duplicate" means.
const FIRESTORE_ALREADY_EXISTS_CODE = 6

export function isAlreadyExistsError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === FIRESTORE_ALREADY_EXISTS_CODE
}
```

**Modify `firebase.json`** — add a `functions` block alongside the existing `firestore` block:
```json
{
  "firestore": [
    {
      "database": "default",
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    }
  ],
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log", "*.local"]
    }
  ]
}
```

- [ ] Run `npm install` inside `functions/` and confirm it succeeds with no peer-dependency errors.
- [ ] Run `npx tsc --noEmit` inside `functions/` against `functions/src/firestore.ts` and `functions/src/idempotent.ts` (no other source files exist yet) — must be clean.
- [ ] Commit: `git add functions/package.json functions/tsconfig.json functions/.gitignore functions/src/firestore.ts functions/src/idempotent.ts firebase.json && git commit -m "feat(notifications): scaffold Cloud Functions project"`. Do NOT commit `functions/node_modules` or `functions/lib` (covered by `functions/.gitignore`).

---

### Task 2: Low-stock trigger

**Files:**
- Create: `functions/src/lowStock.ts`
- Modify: `functions/src/index.ts` (create if it doesn't exist yet — export this trigger)

**Interfaces:**
- Consumes: `getFunctionsFirestore()` from Task 1.
- Produces: the exported Cloud Function `onLowStock`, registered in `functions/src/index.ts`.

```ts
// functions/src/lowStock.ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

export const onLowStock = onDocumentCreated(
  { document: 'stockMovements/{movementId}', database: 'default' },
  async (event) => {
    const movement = event.data?.data()
    if (!movement) return

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
    // documented limitation: if a second movement for the same product+
    // branch lands between that transaction committing and this handler's
    // read, quantityAfter reflects BOTH movements, not just this one — the
    // "before" value would be off. Accepted for this phase's traffic level;
    // there is no other way to reconstruct it without storing a quantity
    // snapshot on stockMovements itself, which would mean touching the
    // already-audited write path this phase must not touch.
    const quantityBefore = quantityAfter - quantityDelta

    const newlyCrossed = quantityAfter <= reorderThreshold && quantityBefore > reorderThreshold
    if (!newlyCrossed) return

    const productName = productSnap.data()!.name as string
    const branchName = branchSnap.exists ? (branchSnap.data()!.name as string) : branchId

    const [branchManagersSnap, orgAdminsSnap] = await Promise.all([
      db.collection('staff').where('role', '==', 'branch_manager').where('branchId', '==', branchId).get(),
      db.collection('staff').where('role', 'in', ['admin', 'super_admin']).get(),
    ])
    const recipientUids = new Set<string>([
      ...branchManagersSnap.docs.map((d) => d.id),
      ...orgAdminsSnap.docs.map((d) => d.id),
    ])
    // Empty recipient set (e.g. a branch with no assigned branch_manager,
    // in a system that otherwise also somehow has no admin/super_admin —
    // shouldn't happen in practice, but this trigger must not error or
    // commit a no-op batch if it does) — nothing to notify, done.
    if (recipientUids.size === 0) return

    const movementId = event.params.movementId
    const batch = db.batch()
    for (const recipientUid of recipientUids) {
      const notifRef = db.collection('notifications').doc(`low_stock_${movementId}_${recipientUid}`)
      batch.create(notifRef, {
        recipientUid,
        type: 'low_stock',
        title: `Low stock: ${productName}`,
        body: `${productName} at ${branchName} is at ${quantityAfter} units (reorder threshold ${reorderThreshold}).`,
        relatedId: productId,
        read: false,
        createdAt: new Date(),
      })
    }
    try {
      await batch.commit()
    } catch (err) {
      // A retry of this exact event: every create() in the batch fails
      // together (batches are atomic) because every doc already exists
      // from the first delivery. Harmless — swallow it. Anything else
      // (a real failure) still propagates.
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
```

```ts
// functions/src/index.ts
export { onLowStock } from './lowStock'
```

- [ ] `npx tsc --noEmit` inside `functions/` clean.
- [ ] Trace by hand against the exit criterion: a movement that drops quantity from above threshold to at/below it → `newlyCrossed` true → notifications batch-created. A second movement that keeps it at/below (e.g., another sale while already low) → `quantityBefore` is also `<= reorderThreshold` → `newlyCrossed` false → no duplicate.
- [ ] Trace the empty-recipient-set guard and the `isAlreadyExistsError` catch by hand — both are unreachable in normal operation but must not throw if hit.
- [ ] Commit: `git add functions/src/lowStock.ts functions/src/index.ts && git commit -m "feat(notifications): low-stock Cloud Function trigger"`.

---

### Task 3: Leave-request-submitted and leave-request-reviewed triggers

**Files:**
- Create: `functions/src/leaveNotifications.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `getFunctionsFirestore()` from Task 1.
- Produces: exported `onLeaveRequestSubmitted`, `onLeaveRequestReviewed`.

```ts
// functions/src/leaveNotifications.ts
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

// Duplicated from src/lib/auth/permissions.ts's APPROVER_ROLES — this is a
// separate deployable with its own tsconfig/build (Task 1 deliberately does
// not reach into the root src/ tree), so it can't import that constant the
// way two files inside the same Next.js build can. Same situation
// firestore.rules is already in for the same reason (see its ADMIN_HR/
// ADMIN_IT "keep in sync" comments) — this is that exact, already-accepted
// pattern applied to a second cross-boundary case, not a new one. If
// APPROVER_ROLES ever changes in permissions.ts, update this list too.
const APPROVER_ROLES_BEYOND_BRANCH_MANAGER = ['hr_admin', 'admin', 'super_admin']

function formatDate(ts: FirebaseFirestore.Timestamp): string {
  return ts.toDate().toISOString().slice(0, 10)
}

export const onLeaveRequestSubmitted = onDocumentCreated(
  { document: 'leaveRequests/{requestId}', database: 'default' },
  async (event) => {
    const request = event.data?.data()
    if (!request) return

    const { staffId, branchId, type, startDate, endDate } = request as {
      staffId: string
      branchId: string
      type: string
      startDate: FirebaseFirestore.Timestamp
      endDate: FirebaseFirestore.Timestamp
    }

    const db = getFunctionsFirestore()
    const requesterSnap = await db.collection('staff').doc(staffId).get()
    const requesterName = requesterSnap.exists ? (requesterSnap.data()!.name as string) : staffId

    const [branchManagersSnap, otherApproversSnap] = await Promise.all([
      db.collection('staff').where('role', '==', 'branch_manager').where('branchId', '==', branchId).get(),
      db.collection('staff').where('role', 'in', APPROVER_ROLES_BEYOND_BRANCH_MANAGER).get(),
    ])
    const recipientUids = new Set<string>([
      ...branchManagersSnap.docs.map((d) => d.id),
      ...otherApproversSnap.docs.map((d) => d.id),
    ])
    // A requester who happens to also be an approver (e.g. a branch_manager
    // requesting their own leave) shouldn't be notified about their own
    // submission.
    recipientUids.delete(staffId)
    // Empty recipient set (e.g. a branch with no branch_manager and,
    // somehow, no org-wide approver either) — nothing to notify, done;
    // must not error or commit a no-op batch.
    if (recipientUids.size === 0) return

    const requestId = event.params.requestId
    const batch = db.batch()
    for (const recipientUid of recipientUids) {
      const notifRef = db.collection('notifications').doc(`leave_request_submitted_${requestId}_${recipientUid}`)
      batch.create(notifRef, {
        recipientUid,
        type: 'leave_request_submitted',
        title: 'New leave request',
        body: `${requesterName} requested ${type} leave from ${formatDate(startDate)} to ${formatDate(endDate)}.`,
        relatedId: requestId,
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

export const onLeaveRequestReviewed = onDocumentUpdated(
  { document: 'leaveRequests/{requestId}', database: 'default' },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return

    const statusJustDecided = before.status === 'pending' && (after.status === 'approved' || after.status === 'rejected')
    if (!statusJustDecided) return

    const { staffId, type, startDate, endDate, status, reviewNote } = after as {
      staffId: string
      type: string
      startDate: FirebaseFirestore.Timestamp
      endDate: FirebaseFirestore.Timestamp
      status: 'approved' | 'rejected'
      reviewNote: string | null
    }

    const db = getFunctionsFirestore()
    const requestId = event.params.requestId
    const notifRef = db.collection('notifications').doc(`leave_request_reviewed_${requestId}_${staffId}`)
    try {
      await notifRef.create({
        recipientUid: staffId,
        type: 'leave_request_reviewed',
        title: `Leave request ${status}`,
        body: `Your ${type} leave request (${formatDate(startDate)} – ${formatDate(endDate)}) was ${status}.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
        relatedId: requestId,
        read: false,
        createdAt: new Date(),
      })
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
```

```ts
// functions/src/index.ts
export { onLowStock } from './lowStock'
export { onLeaveRequestSubmitted, onLeaveRequestReviewed } from './leaveNotifications'
```

**Note on deploying:** these are the only three Cloud Functions this phase adds, and none of them run until `firebase deploy --only functions` is actually run against the real `lfd-erp-4713b` project — that's a real-infrastructure action, not a local build step. Flag it back to the user before running it, same as any other action affecting shared/live state; a local `tsc` clean build is not the same as a deployed, firing trigger, and the exit criteria (a stock movement actually creating a notification) can only be verified after that deploy step happens.

- [ ] `npx tsc --noEmit` inside `functions/` clean.
- [ ] Trace `onLeaveRequestSubmitted` by hand: a new request → `branch_manager` at that branch + `hr_admin`/`admin`/`super_admin` all get a notification; the requester themselves (if they happen to hold one of those roles) does not; an empty recipient set returns early without touching Firestore.
- [ ] Trace `onLeaveRequestReviewed` by hand: `pending → approved` or `pending → rejected` → exactly one notification, to `staffId` (the requester), never to whoever performed the review — detected via `event.data.before`/`event.data.after` snapshots (per your go-ahead), not by re-reading the document. An edit that doesn't touch `status`, or a `status` that was never `pending` in `before` (shouldn't happen given Phase 5's guards, but the check is explicit either way), produces nothing.
- [ ] Trace both triggers' `isAlreadyExistsError` catch by hand — a retry of the same event must not throw.
- [ ] Commit: `git add functions/src/leaveNotifications.ts functions/src/index.ts && git commit -m "feat(notifications): leave-request submitted/reviewed Cloud Function triggers"`.

---

## App-side: types, API routes, rules, indexes, UI

### Task 4: `Notification` type + API routes

**Files:**
- Create: `src/lib/types/notification.ts`
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/[id]/route.ts`

**Interfaces:**
- Produces: `Notification`, `NotificationType` (exact shape in "Data model" above) — the two routes and the UI (Task 6) all use these.

`src/lib/types/notification.ts` — exactly the `Notification`/`NotificationType` interfaces from the "Data model" section above.

`src/app/api/notifications/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getSessionUser } from '@/lib/auth/server-guard'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const snap = await getAdminFirestore()
    .collection('notifications')
    .where('recipientUid', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()

  return NextResponse.json(
    snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        type: data.type,
        title: data.title,
        body: data.body,
        relatedId: data.relatedId,
        read: data.read,
        createdAt: data.createdAt.toDate().toISOString(),
      }
    })
  )
}
```
(No `requireCapability` call anywhere in this file — deliberate, per Global Constraints. Field-by-field row construction with `createdAt` converted before the response leaves the server, matching this codebase's Timestamp-leak discipline for anything a client `fetch()` will read — the exact class of bug fixed in Phase 5's `/api/attendance/me`.)

`src/app/api/notifications/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getSessionUser } from '@/lib/auth/server-guard'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const db = getAdminFirestore()
  const docRef = db.collection('notifications').doc(id)
  const doc = await docRef.get()
  if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = doc.data()!
  // Same 404-not-403 idiom already used for cross-branch staff access in
  // src/app/api/staff/[staffId]/route.ts — don't reveal that a notification
  // belonging to someone else exists.
  if (existing.recipientUid !== user.uid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await docRef.update({ read: true })
  return NextResponse.json({ ok: true })
}
```

- [ ] `npx tsc --noEmit` clean from the repo root.
- [ ] Trace the exit criterion "a user can only see and mark-read their own" by hand: `GET` is filtered by `recipientUid == user.uid` at the query level (can't return someone else's row at all); `PATCH` on someone else's notification ID returns 404 (not 200), because of the explicit ownership check above.
- [ ] Commit: `git add src/lib/types/notification.ts src/app/api/notifications/route.ts "src/app/api/notifications/[id]/route.ts" && git commit -m "feat(notifications): list-own and mark-read API routes"`.

---

### Task 5: Firestore rules + index

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

**Add to `firestore.rules`**, before the catch-all:
```
match /notifications/{notificationId} {
  allow read, write: if false; // all access goes through /api/notifications — personal data, same fully-closed treatment as leaveRequests/attendanceRecords
}
```

**Add to `firestore.indexes.json`** (the `GET` route's `where('recipientUid','==',...).orderBy('createdAt','desc')` is an equality-filter + orderBy-on-a-different-field query — needs a composite index, the same recurring class this project keeps hitting):
```json
{
  "collectionGroup": "notifications",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "recipientUid", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

- [ ] Validate `firestore.indexes.json` is still valid JSON (`node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8'))"`).
- [ ] Commit: `git add firestore.rules firestore.indexes.json && git commit -m "feat(notifications): Firestore rules and index for notifications"`.

---

### Task 6: Notification bell UI

**Files:**
- Create: `src/components/notifications/NotificationBell.tsx`
- Modify: `src/components/layout/NavShell.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications`, `PATCH /api/notifications/[id]` (Task 4). Note the client-side shape is NOT the `Notification` type from Task 4 as-is — that type's `createdAt: FirebaseFirestore.Timestamp` is a server-side Firestore-doc shape, but the actual JSON response has `createdAt` as an ISO string (converted server-side) and omits `recipientUid` entirely. Define a small client-local type for the fetched shape rather than reusing `Notification` directly — the same "don't let a server-side Firestore type leak into client state" discipline every other client component in this app already follows.

Read `src/components/layout/NavShell.tsx` and `src/components/attendance/AttendanceWidget.tsx` first — the bell is a `'use client'` component fetching on mount (same pattern as `AttendanceWidget`), placed in `NavShell`'s existing `<header>` between the email/role `<span>` and the "Sign out" button.

`NotificationBell.tsx`:
- On mount, `GET /api/notifications`, store the array in state.
- Unread count = `notifications.filter(n => !n.read).length`, computed from that same array — no second endpoint.
- A button showing a bell glyph (`🔔` is fine — this codebase doesn't use an icon library) with a small badge showing the unread count when `> 0` (no badge when zero).
- Clicking the button toggles a dropdown panel (absolutely positioned, matching this codebase's existing dropdown-free style — a simple `absolute` positioned `div` under the button is enough, no portal/library needed) listing notifications newest-first: `title`, `body`, a relative-or-absolute rendered `createdAt`, visually distinguished if `!read` (e.g. a dot or bold title).
- Clicking a notification row: `PATCH /api/notifications/${id}` (fire and update local state to `read: true` optimistically — no need to refetch the whole list), then navigate to the related record where it makes sense:
  - `type === 'low_stock'` → `/products/${relatedId}`
  - `type === 'leave_request_submitted'` → `/leave/review`
  - `type === 'leave_request_reviewed'` → `/leave`
  (These three destinations are a judgment call — the scope says "where it makes sense," and these are the closest existing screen for each notification's subject; flagging rather than treating as an exact spec match.)
- Re-fetch the list each time the dropdown is opened (not just on mount), so it's reasonably fresh without introducing a live Firestore listener — this codebase has no client-side Firestore reads anywhere else (every data read goes through an API route/server component), and a listener here would be a new architectural pattern this phase doesn't need to introduce.

`NavShell.tsx` — one addition: `<NotificationBell />` placed between the existing `user.email`/role `<span>` and the "Sign out" `<button>` inside the `<header>`.

- [ ] `npx tsc --noEmit` and `npx next build` both clean.
- [ ] Commit: `git add src/components/notifications/NotificationBell.tsx src/components/layout/NavShell.tsx && git commit -m "feat(notifications): notification bell in nav shell"`.

---

### Task 7: Full exit-criteria pass + deploy gate

- [ ] Re-confirm directly (not from memory) that `git diff` against the four named route files shows zero changes across this entire phase's commits: `git diff <phase-6-start-commit>..HEAD -- src/app/api/sales/route.ts src/app/api/stock/movements/route.ts src/app/api/stock/transfer/route.ts src/app/api/leave-requests` must be empty.
- [ ] `npx tsc --noEmit` and `npx next build` clean at the repo root; `npx tsc --noEmit` clean inside `functions/`.
- [ ] Re-flag TD-1 as untouched in the completion report (this phase's diff doesn't include `product_edit`/`service_edit`/`supplier_edit`/`customer_create`'s files).
- [ ] **Stop before deploying the Cloud Functions.** `firebase deploy --only functions` is a real-infrastructure action against the live `lfd-erp-4713b` project — surface it and get explicit go-ahead, the same as any other action that affects shared/live state, before running it. The full exit criteria (a real stock movement or leave request actually producing a notification) can only be verified live, after that deploy.

---

## Decisions confirmed by your go-ahead (no longer open)

- **Leave review transitions are detected via `event.data.before`/`event.data.after` snapshots** — already the design above, confirmed rather than changed.
- **Notification writes use `create()` (or `batch.create()`), not `set()`**, specifically for idempotent-on-retry semantics — swallowing exactly `ALREADY_EXISTS` via the shared `isAlreadyExistsError` helper, propagating anything else.
- **The low-stock race is accepted, and now formally tracked** as `TD-2` in `docs/tech-debt.md` (not just a code comment) — includes the proposed future fix (`resultingQuantity` on `StockMovement`) and the constraint that fixing it means touching an already-audited route, so it needs the same review rigor as any other change to those files.
- **Empty recipient sets are handled explicitly** — both `onLowStock` and `onLeaveRequestSubmitted` return early before touching Firestore if the recipient set is empty, rather than committing a no-op batch and relying on undefined behavior.
- **Cloud Functions deployment stays a separate, explicitly-gated step** (Task 7) — already the design above, confirmed rather than changed.

## Remaining open questions / judgment calls (flagging per project convention, not guessing)

- **`APPROVER_ROLES` is duplicated in `functions/src/leaveNotifications.ts`** rather than imported from `src/lib/auth/permissions.ts`. `functions/` is a separate deployable with its own `tsconfig`/build, the same boundary `firestore.rules` already can't cross (see its existing `ADMIN_HR`/`ADMIN_IT` "keep in sync" comments) — this applies that same, already-accepted pattern rather than attempting a cross-package TypeScript import that would need a nonstandard `functions/tsconfig.json` (`rootDir` reaching outside `functions/`) and could break the Firebase CLI's expected `functions/lib/index.js` output layout. If you'd rather have a real shared import despite that fragility, this is the moment to say so.
- **`notifications` gets no `Capability` entry at all** — ownership (`recipientUid == user.uid`) is the sole gate, checked with a bare `getSessionUser()`. This is explicit in your scope text ("no capability needed beyond being authenticated") and is a genuine first for this codebase (every other module, including Phase 5's `hr.*`, has at least an ALL_ROLES-style capability). Flagging so it doesn't read as an oversight later.
- **Notification click-through destinations** (`/products/[id]`, `/leave/review`, `/leave`) are inferred from "where it makes sense," not spelled out in your scope text.
- **No Firebase Cloud Functions emulator / integration test harness is introduced.** Verification for this phase is `tsc`-clean plus a hand-traced check per trigger, then a live check after an explicit, separately-approved deploy — consistent with this project's no-automated-test-suite policy, but flagging because Cloud Functions are a new deployable category where "no tests" means the *only* verification before deploy is static analysis and manual tracing, not even the `tsc`+`next build`-level confidence the rest of the app gets.
- Email/SMS/push delivery, notification preferences/opt-out, and digest/batching are explicitly out of scope per your instruction — not touched anywhere in this plan.
- `docs/project-brief.md` still doesn't exist (same note as every prior phase) — this plan is built from your Phase 6 scope message plus `CLAUDE.md` (updated as part of this planning pass), not that file.
