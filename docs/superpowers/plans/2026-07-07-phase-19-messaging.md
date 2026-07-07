# Phase 19 — Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add staff-to-staff messaging along the real organizational hierarchy (staff→branch_manager→general_manager) plus a flat IT-support line, built around the app's first *relationship*-based access check (`canMessage(sender, recipient)`) rather than a capability check.

**Architecture:** Two new closed Firestore collections (`conversations`, `messages`), a deterministic-ID get-or-create pattern identical to `attendanceRecords`, a pure `canMessage()` function re-evaluated from live Firebase custom claims on every send (never trusted from a cached/denormalized snapshot), two new API routes, one new Cloud Function trigger following the existing `onAppointmentScheduled` template, and a two-page UI (conversation list + thread view) matching this app's existing page-per-view convention.

**Tech Stack:** Next.js App Router (server components + one client component pair), Firebase Admin SDK (Firestore + Auth custom claims), Cloud Functions v2 (`onDocumentCreated`), no new dependencies.

## Global Constraints

- Every route uses `requireCapability`/`getSessionUser` from `src/lib/auth/server-guard.ts` — never a hand-rolled auth check.
- Firestore rules default-deny; `conversations`/`messages` are fully closed (`allow read, write: if false`) like `treatments`/`appointments`/`leaveRequests` — no client Firestore access at all, everything through the Admin SDK.
- Per this project's architecture ("Firebase custom claims are the sole source of truth for authorization; Firestore is profile metadata only and is never read to make an access-control decision" — CLAUDE.md, Permissions section): the **sender's** role/branchId comes from their verified session cookie (already claims-backed). The **recipient's** role/branchId, at the point a message is actually sent or a thread actually read (`GET`/`POST /api/messaging/messages`), must be re-fetched live from Firebase Auth custom claims (`getAdminAuth().getUser(uid).customClaims`), never from the `staff` Firestore doc — those are the two routes that make an authorization decision, and the `staff` doc is only ever used there for display metadata (name), never to decide access. **Amended 2026-07-07, post-final-review:** this live-claims requirement scopes to that enforcement point only, not to `GET /api/messaging/conversations`'s advisory contact/conversation list, which reads role/branchId from the `staff` doc for its `canReply` hint. That list never grants access by itself — real enforcement happens at send/read time per the rule above — and reading `staff` once instead of one `getUser()` Auth call per staff member per 15s poll is a deliberate, accepted perf trade-off, confirmed via the final whole-branch review and explicit user decision rather than left as a silent contradiction.
- **No test framework exists in this repo** (confirmed: `package.json` has no jest/vitest/tsx/ts-node, no `*.test.ts` files anywhere outside `node_modules`). Every prior phase in this project has been verified live against real `erp-lfd` data instead of with automated tests — this plan follows that same established convention rather than introducing a new one for just this phase. Where a step would normally be "write the failing test," it is instead "write a throwaway verification script, run it, delete it" (Task 1) or a live HTTP check against a running dev server (Tasks 2-5), matching this project's UAT convention.
- Money/inventory-transaction-tier Opus review does not apply here (no numeric quantity, no payment), but this phase's `canMessage` logic and its live-send enforcement (Task 1, Task 3) are "the single security-critical property this phase is judged on" in the same sense Phase 5's self-approval block was — those two tasks get Opus review; Task 2 (read-only listing), Task 4 (Cloud Function, template-following), and Task 5 (UI) get Sonnet review.
- Audit action naming follows the existing `_create` suffix convention (`appointment_create`, `lab_order_create`, `seminar_attendance_record`) — the new action is `message_create`, not `message_send`.

---

## Flagged before starting — read before approving this plan

1. **There is no existing route that changes a staff member's `branchId` after creation.** `PATCH /api/staff/[staffId]`'s `EDITABLE_FIELDS` deliberately excludes `branchId` ("branchId... immutable/derived server-side," per that route's own comment). The exit criterion "changing a staff member's branch after a conversation exists correctly closes off a conversation" therefore cannot be verified through any existing app feature. This plan does **not** add a branch-reassignment feature (that would be scope creep beyond a messaging phase) — verification of this one criterion will use a one-off Admin SDK script that updates the target account's custom claims directly (`auth.setCustomUserClaims`), the same technique already used to provision every test account in this project's UAT history, not a new shipped capability.
2. **`admin` is treated as generic staff** (reaches only their own branch's `branch_manager`), per the spec's own instruction to flag rather than special-case it. Flagging as requested — no code change needed unless you say otherwise.
3. **IT support line UI:** rather than a separate NavShell-level shortcut, the IT-support line satisfies "easy to find, not buried" by being its own labeled section at the top of the single `/messages` conversation list (any `it_admin` staff member is always a reachable contact for everyone, and is grouped separately from the hierarchy contacts). No second entry point is added elsewhere. Flag if you wanted something more prominent (e.g. a NavShell button).
4. **Read receipts beyond the spec'd `read` boolean, message editing, deletion, group conversations, and real-time delivery are out of scope**, per the spec's own exit criteria — none of this plan's tasks touch them.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/auth/permissions.ts` | Modify: add `messaging` module + `messaging.access` capability (→ `ALL_ROLES`) |
| `src/lib/types/messaging.ts` | New: `Conversation`, `Message` types |
| `src/lib/types/audit.ts` | Modify: add `message_create` action |
| `src/lib/types/notification.ts` | Modify: add `message_received` notification type |
| `src/lib/messaging/canMessage.ts` | New: the relationship-check itself, pure function |
| `src/lib/messaging/getMessagingParty.ts` | New: live custom-claims lookup for a non-caller uid |
| `firestore.rules` | Modify: close `conversations`/`messages` |
| `firestore.indexes.json` | Modify: one composite index for `messages` |
| `src/app/api/messaging/conversations/route.ts` | New: `GET` — reachable contacts + existing conversations, merged |
| `src/app/api/messaging/messages/route.ts` | New: `GET`/`POST` — thread read + send, live `canMessage` enforcement |
| `functions/src/messageNotifications.ts` | New: `onMessageSent` trigger |
| `functions/src/index.ts` | Modify: export the new trigger |
| `src/components/notifications/NotificationBell.tsx` | Modify: route `message_received` to the thread |
| `src/components/messaging/ConversationList.tsx` | New: client component, polling list |
| `src/components/messaging/ThreadView.tsx` | New: client component, polling thread + compose |
| `src/app/(dashboard)/messages/page.tsx` | New: server guard + `ConversationList` |
| `src/app/(dashboard)/messages/[peerUid]/page.tsx` | New: server guard + `ThreadView` |
| `src/components/layout/Sidebar.tsx` | Modify: add `Messages` nav entry, visible to all roles |

**API contract (locks in the shape every task after Task 1 depends on):**

```ts
// GET /api/messaging/conversations -> 200
type ConversationListItem = {
  peerUid: string
  peerName: string
  peerRole: RoleId
  lastMessageAt: string | null // ISO, null if no conversation yet
  canReply: boolean            // live canMessage() result, re-checked every request
}

// GET /api/messaging/messages?peerUid=xxx -> 200
type ThreadResponse = {
  peer: { uid: string; name: string; role: RoleId }
  canReply: boolean
  messages: { id: string; senderUid: string; body: string; createdAt: string }[]
}
// 400 peerUid missing or equals caller's own uid
// 404 peerUid does not reference a staff account, OR no conversation exists yet and canReply is false

// POST /api/messaging/messages  body: { peerUid: string; body: string } -> 201 { conversationId: string; messageId: string }
// 400 invalid input (empty peerUid/body, body > 4000 chars, peerUid === caller)
// 404 peerUid does not reference a staff account
// 403 canMessage() is false and no conversation exists yet (never had access)
// 409 canMessage() is false and a conversation already exists (channel has closed since it was created)
```

---

### Task 1: Relationship model — types, permissions, `canMessage`, Firestore rules & indexes

**Files:**
- Modify: `src/lib/auth/permissions.ts`
- Modify: `src/lib/types/audit.ts`
- Create: `src/lib/types/messaging.ts`
- Create: `src/lib/messaging/canMessage.ts`
- Create: `src/lib/messaging/getMessagingParty.ts`
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Produces: `MessagingParty { uid: string; role: RoleId; branchId: string }`, `canMessage(a: MessagingParty, b: MessagingParty): boolean`, `getMessagingParty(uid: string): Promise<MessagingParty | null>`, `Conversation`, `Message` types, `Capability` value `'messaging.access'` (backed by `ALL_ROLES`), `AuditAction` value `'message_create'`.

- [ ] **Step 1: Add the `messaging` module and `messaging.access` capability**

In `src/lib/auth/permissions.ts`, change line 16:

```ts
export const MODULES = ['admin', 'pos', 'inventory', 'crm', 'accounting', 'hr', 'reporting', 'clinical', 'seminars'] as const
```

to:

```ts
export const MODULES = ['admin', 'pos', 'inventory', 'crm', 'accounting', 'hr', 'reporting', 'clinical', 'seminars', 'messaging'] as const
```

Change the `Capability` union (currently ending at line 49 with `| 'pos.delivery.fulfill'`) to add one more line:

```ts
  | 'pos.delivery.fulfill'
  // Gates baseline access to the messaging feature only (i.e. "is this a
  // valid staff account"). It does NOT decide who a given sender can reach —
  // that is canMessage()'s job, re-evaluated per-recipient on every list/read/
  // send, never cached. Granted to every role because everyone has at least
  // one reachable contact (their own branch's branch_manager, at minimum, or
  // the IT support line).
  | 'messaging.access'
```

In `CAPABILITY_MODULE` (ends at line 89/90 with `'pos.delivery.fulfill': 'pos',`), add:

```ts
  'pos.delivery.fulfill': 'pos',
  'messaging.access': 'messaging',
```

In `ROLE_CAPABILITIES` (ends at line 238 with `'pos.delivery.fulfill': POS_DELIVERY_FULFILL_ROLES,`), add:

```ts
  'pos.delivery.fulfill': POS_DELIVERY_FULFILL_ROLES,
  'messaging.access': ALL_ROLES,
```

No new role-list constant is needed — `ALL_ROLES` already exists (line 92) and is exactly what `hr.leave.request`/`hr.attendance.self` already use for "every role gets this."

- [ ] **Step 2: Add the `message_create` audit action**

In `src/lib/types/audit.ts`, change:

```ts
  | 'pending_delivery_fulfilled'
```

to:

```ts
  | 'pending_delivery_fulfilled'
  | 'message_create'
```

- [ ] **Step 3: Create the messaging types**

Create `src/lib/types/messaging.ts`:

```ts
import type { RoleId } from '@/lib/auth/permissions'

export interface Conversation {
  id: string
  participantUids: string[] // exactly 2, sorted ascending — also the deterministic doc ID, joined with '_'
  participantRoles: Record<string, RoleId>
  participantNames: Record<string, string>
  lastMessageAt: FirebaseFirestore.Timestamp
  createdAt: FirebaseFirestore.Timestamp
}

export interface Message {
  id: string
  conversationId: string
  senderUid: string
  body: string
  createdAt: FirebaseFirestore.Timestamp
  read: boolean
}
```

- [ ] **Step 4: Write `canMessage` — the relationship check itself**

Create `src/lib/messaging/canMessage.ts`:

```ts
import type { RoleId } from '@/lib/auth/permissions'

export interface MessagingParty {
  uid: string
  role: RoleId
  branchId: string
}

// Roles that sit inside the messaging hierarchy rather than being "generic
// staff" reaching upward toward it. it_admin/super_admin are listed here too
// because they're handled by their own unconditional rules below, not the
// staff<->branch_manager rule.
const HIERARCHY_EXEMPT_ROLES: RoleId[] = ['branch_manager', 'general_manager', 'it_admin', 'super_admin']

function isGenericStaff(role: RoleId): boolean {
  return !HIERARCHY_EXEMPT_ROLES.includes(role)
}

// The one relationship check this whole phase exists to implement. Unlike
// every other permission in this app, this is NOT "does this role hold a
// capability" — it depends on BOTH parties' role and branch together, and
// must be re-evaluated fresh every time (see getMessagingParty.ts), never
// cached from when a conversation was first created.
//
// Symmetric by construction — every rule below is written both directions,
// so canMessage(a, b) === canMessage(b, a) always. `admin` is deliberately
// NOT special-cased: it falls through to isGenericStaff() like any other
// non-hierarchy role, reaching only its own branch's branch_manager, per
// this phase's explicit instruction to flag rather than carve out admin.
export function canMessage(a: MessagingParty, b: MessagingParty): boolean {
  if (a.uid === b.uid) return false
  if (a.role === 'super_admin' || b.role === 'super_admin') return true
  if (a.role === 'it_admin' || b.role === 'it_admin') return true
  if (isGenericStaff(a.role) && b.role === 'branch_manager' && a.branchId === b.branchId) return true
  if (isGenericStaff(b.role) && a.role === 'branch_manager' && b.branchId === a.branchId) return true
  if (a.role === 'branch_manager' && b.role === 'general_manager') return true
  if (b.role === 'branch_manager' && a.role === 'general_manager') return true
  return false
}
```

- [ ] **Step 5: Write `getMessagingParty` — live claims lookup for the non-caller side**

Create `src/lib/messaging/getMessagingParty.ts`:

```ts
import { getAdminAuth } from '@/lib/firebase/admin'
import type { RoleId } from '@/lib/auth/permissions'
import type { MessagingParty } from './canMessage'

// Re-derives a user's CURRENT role/branchId from their Firebase Auth custom
// claims — the sole source of truth for authorization in this app — rather
// than the `staff` Firestore doc, which is profile metadata only and must
// never back an access-control decision (see CLAUDE.md's Permissions
// section). The caller's own session cookie already carries live claims
// (verifySessionCookie's checkRevoked=true means a stale session can't even
// authenticate); this helper exists specifically for the OTHER participant,
// whose claims we have no session for and must fetch directly.
export async function getMessagingParty(uid: string): Promise<MessagingParty | null> {
  const userRecord = await getAdminAuth().getUser(uid).catch(() => null)
  if (!userRecord) return null
  const claims = userRecord.customClaims as { role?: RoleId; branchId?: string } | undefined
  if (!claims?.role || !claims?.branchId) return null
  return { uid, role: claims.role, branchId: claims.branchId }
}
```

- [ ] **Step 6: Close the two new collections in Firestore rules**

In `firestore.rules`, add before the final catch-all (`match /{document=**}`):

```
    match /conversations/{conversationId} {
      allow read, write: if false; // all access goes through /api/messaging — private staff communication, same fully-closed treatment as leaveRequests/notifications
    }
    match /messages/{messageId} {
      allow read, write: if false; // all access goes through /api/messaging
    }
```

- [ ] **Step 7: Add the one composite index this phase needs**

In `firestore.indexes.json`, add to the `indexes` array (before the closing `]`):

```json
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "conversationId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    }
```

No index is needed for `conversations`: the list route (Task 2) queries `where('participantUids', 'array-contains', uid)` with no `orderBy` in the Firestore query itself (sorting happens in application code after the merge with reachable contacts) — a bare `array-contains` filter is automatically indexed, and combining it with an `orderBy` on a different field is exactly the case that *would* need a manual composite index, so the sort is deliberately kept out of the query to avoid that.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Verify `canMessage` against the full exit-criteria matrix**

No test framework exists in this repo, so this is a throwaway compiled script, not a permanent test file — delete it in the last sub-step.

Run:
```
npx tsc src/lib/messaging/canMessage.ts --outDir .tmp-verify --module commonjs --target es2020 --esModuleInterop
```

Then run:
```
node -e "
const { canMessage } = require('./.tmp-verify/canMessage.js');
const staff      = { uid: 's1',  role: 'cashier',         branchId: 'b1' };
const staffOther = { uid: 's2',  role: 'cashier',         branchId: 'b1' };
const bmSame     = { uid: 'bm1', role: 'branch_manager',  branchId: 'b1' };
const bmOther    = { uid: 'bm2', role: 'branch_manager',  branchId: 'b2' };
const gm         = { uid: 'gm1', role: 'general_manager', branchId: 'b1' };
const it         = { uid: 'it1', role: 'it_admin',        branchId: 'b1' };
const sa         = { uid: 'sa1', role: 'super_admin',     branchId: 'b1' };
const admin      = { uid: 'a1',  role: 'admin',           branchId: 'b1' };
const checks = [
  ['staff -> own branch_manager',        canMessage(staff, bmSame),      true],
  ['staff -> other-branch branch_manager', canMessage(staff, bmOther),   false],
  ['staff -> other staff',               canMessage(staff, staffOther),  false],
  ['branch_manager -> own staff',        canMessage(bmSame, staff),      true],
  ['branch_manager -> other-branch staff', canMessage(bmOther, staff),   false],
  ['branch_manager -> general_manager',  canMessage(bmSame, gm),         true],
  ['general_manager -> any branch_manager', canMessage(gm, bmOther),     true],
  ['general_manager -> staff directly',  canMessage(gm, staff),          false],
  ['anyone -> it_admin',                 canMessage(staff, it),          true],
  ['it_admin -> anyone',                 canMessage(it, staff),          true],
  ['super_admin -> anyone',              canMessage(sa, staff),          true],
  ['anyone -> super_admin',              canMessage(staff, sa),          true],
  ['self',                               canMessage(staff, staff),       false],
  ['admin treated as generic staff',     canMessage(admin, bmSame),      true],
  ['admin -> other staff (should fail)', canMessage(admin, staffOther),  false],
];
let failed = 0;
for (const [label, actual, expected] of checks) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + label + ' (got ' + actual + ', want ' + expected + ')');
}
process.exit(failed > 0 ? 1 : 0);
"
```
Expected: every line prints `PASS`, exit code 0.

Then delete the compiled scratch output: remove the `.tmp-verify` directory.

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth/permissions.ts src/lib/types/audit.ts src/lib/types/messaging.ts src/lib/messaging/canMessage.ts src/lib/messaging/getMessagingParty.ts firestore.rules firestore.indexes.json
git commit -m "feat(messaging): add canMessage relationship check, messaging.access capability, closed collections"
```

---

### Task 2: Conversation list — `GET /api/messaging/conversations`

**Files:**
- Create: `src/app/api/messaging/conversations/route.ts`

**Interfaces:**
- Consumes: `requireCapability`, `AuthError` (`@/lib/auth/server-guard`), `getAdminFirestore` (`@/lib/firebase/admin`), `canMessage`, `MessagingParty` (`@/lib/messaging/canMessage`).
- Produces: `GET` returning `ConversationListItem[]` per the API contract above — depended on by Task 5's `ConversationList.tsx`.

- [ ] **Step 1: Write the route**

Create `src/app/api/messaging/conversations/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { canMessage, type MessagingParty } from '@/lib/messaging/canMessage'
import type { RoleId } from '@/lib/auth/permissions'

interface ConversationListItem {
  peerUid: string
  peerName: string
  peerRole: RoleId
  lastMessageAt: string | null
  canReply: boolean
}

export async function GET() {
  try {
    const user = await requireCapability('messaging.access')
    const sender: MessagingParty = { uid: user.uid, role: user.role, branchId: user.branchId }
    const db = getAdminFirestore()

    const staffSnap = await db.collection('staff').get()
    const candidates = staffSnap.docs
      .filter((d) => d.id !== user.uid)
      .map((d) => {
        const data = d.data()
        return { uid: d.id, role: data.role as RoleId, branchId: data.branchId as string, name: data.name as string }
      })

    const convSnap = await db.collection('conversations').where('participantUids', 'array-contains', user.uid).get()
    const conversationByPeer = new Map<string, string | null>()
    for (const doc of convSnap.docs) {
      const data = doc.data()
      const participantUids = data.participantUids as string[]
      const peerUid = participantUids.find((uid) => uid !== user.uid)
      if (!peerUid) continue
      const lastMessageAt = data.lastMessageAt as FirebaseFirestore.Timestamp | undefined
      conversationByPeer.set(peerUid, lastMessageAt ? lastMessageAt.toDate().toISOString() : null)
    }

    const items: ConversationListItem[] = candidates
      .map((c) => {
        const hasConversation = conversationByPeer.has(c.uid)
        const isReachable = canMessage(sender, { uid: c.uid, role: c.role, branchId: c.branchId })
        if (!hasConversation && !isReachable) return null
        return {
          peerUid: c.uid,
          peerName: c.name,
          peerRole: c.role,
          lastMessageAt: conversationByPeer.get(c.uid) ?? null,
          canReply: isReachable,
        }
      })
      .filter((item): item is ConversationListItem => item !== null)
      .sort((a, b) => {
        if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt)
        if (a.lastMessageAt) return -1
        if (b.lastMessageAt) return 1
        return a.peerName.localeCompare(b.peerName)
      })

    return NextResponse.json(items)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live verify against the dev server**

Start the dev server in the background: `npm run dev` (per this project's established UAT convention, background it and log to the scratchpad).

Using a real test account's session cookie (mint via the same Admin-SDK custom-token-exchange technique used in every prior phase's UAT — one `cashier` and one `branch_manager` in the same branch, one `general_manager`, one `it_admin`), confirm:
- A `cashier` sees exactly their own branch's `branch_manager` (and any `it_admin`) in the response, `canReply: true` for both.
- A `general_manager` sees every `branch_manager` org-wide, `canReply: true`, and does **not** see any generic staff member who has no prior conversation with them.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/messaging/conversations/route.ts
git commit -m "feat(messaging): add GET /api/messaging/conversations reachable-contacts list"
```

---

### Task 3: Thread read + send — `GET`/`POST /api/messaging/messages` (Opus review — this is where the relationship check is actually enforced)

**Files:**
- Create: `src/app/api/messaging/messages/route.ts`

**Interfaces:**
- Consumes: `requireCapability`, `AuthError`, `getAdminFirestore`, `writeAuditLog`, `canMessage`, `getMessagingParty`, `MessagingParty`.
- Produces: `GET`/`POST` per the API contract above — depended on by Task 5's `ThreadView.tsx`. `POST` triggers Task 4's Cloud Function indirectly by writing to `messages`.

- [ ] **Step 1: Write the route**

Create `src/app/api/messaging/messages/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { canMessage, type MessagingParty } from '@/lib/messaging/canMessage'
import { getMessagingParty } from '@/lib/messaging/getMessagingParty'

const MAX_BODY_LENGTH = 4000

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function conversationIdFor(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_')
}

export async function GET(request: Request) {
  try {
    const user = await requireCapability('messaging.access')
    const { searchParams } = new URL(request.url)
    const peerUid = searchParams.get('peerUid')

    if (!isNonEmptyString(peerUid) || peerUid === user.uid) {
      return NextResponse.json({ error: 'peerUid is required and must not be the caller' }, { status: 400 })
    }

    const peerParty = await getMessagingParty(peerUid)
    if (!peerParty) {
      return NextResponse.json({ error: 'peerUid does not reference an existing staff account' }, { status: 404 })
    }

    const db = getAdminFirestore()
    const sender: MessagingParty = { uid: user.uid, role: user.role, branchId: user.branchId }
    const canReply = canMessage(sender, peerParty)

    const peerStaffSnap = await db.collection('staff').doc(peerUid).get()
    const peerName = (peerStaffSnap.data()?.name as string | undefined) ?? peerUid

    const conversationId = conversationIdFor(user.uid, peerUid)
    const convSnap = await db.collection('conversations').doc(conversationId).get()

    if (!convSnap.exists) {
      if (!canReply) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ peer: { uid: peerUid, name: peerName, role: peerParty.role }, canReply: true, messages: [] })
    }

    const messagesSnap = await db
      .collection('messages')
      .where('conversationId', '==', conversationId)
      .orderBy('createdAt', 'asc')
      .get()

    const unreadFromPeer = messagesSnap.docs.filter((d) => d.data().senderUid !== user.uid && d.data().read === false)
    if (unreadFromPeer.length > 0) {
      const batch = db.batch()
      for (const doc of unreadFromPeer) batch.update(doc.ref, { read: true })
      await batch.commit()
    }

    const messages = messagesSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        senderUid: data.senderUid as string,
        body: data.body as string,
        createdAt: (data.createdAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
      }
    })

    return NextResponse.json({ peer: { uid: peerUid, name: peerName, role: peerParty.role }, canReply, messages })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('messaging.access')
    const body = await request.json()

    if (!isNonEmptyString(body.peerUid) || body.peerUid === user.uid) {
      return NextResponse.json({ error: 'peerUid is required and must not be the caller' }, { status: 400 })
    }
    if (!isNonEmptyString(body.body) || body.body.trim().length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `body is required and must be at most ${MAX_BODY_LENGTH} characters` }, { status: 400 })
    }

    const peerUid = body.peerUid as string
    const messageBody = (body.body as string).trim()

    const peerParty = await getMessagingParty(peerUid)
    if (!peerParty) {
      return NextResponse.json({ error: 'peerUid does not reference an existing staff account' }, { status: 404 })
    }

    const db = getAdminFirestore()
    const sender: MessagingParty = { uid: user.uid, role: user.role, branchId: user.branchId }
    const conversationId = conversationIdFor(user.uid, peerUid)
    const convRef = db.collection('conversations').doc(conversationId)
    const existingConvSnap = await convRef.get()

    // Re-evaluated fresh, right now, from live claims fetched above — never
    // from a cached relationship on the conversation doc. This is the one
    // enforcement point that makes a role/branch change close off a
    // conversation that used to be valid: if canMessage is false here, it
    // doesn't matter that the conversation already exists.
    const allowed = canMessage(sender, peerParty)
    if (!allowed) {
      const status = existingConvSnap.exists ? 409 : 403
      const message = existingConvSnap.exists
        ? 'This conversation is no longer available — a participant\'s role or branch has changed.'
        : 'You are not able to message this recipient.'
      return NextResponse.json({ error: message }, { status })
    }

    const [senderStaffSnap, peerStaffSnap] = await Promise.all([
      db.collection('staff').doc(user.uid).get(),
      db.collection('staff').doc(peerUid).get(),
    ])
    const senderName = (senderStaffSnap.data()?.name as string | undefined) ?? user.email
    const peerName = (peerStaffSnap.data()?.name as string | undefined) ?? peerUid

    const msgRef = db.collection('messages').doc()

    await db.runTransaction(async (tx) => {
      const convSnap = await tx.get(convRef)
      const now = new Date()
      const conversationFields = {
        participantUids: [user.uid, peerUid].sort(),
        participantRoles: { [user.uid]: user.role, [peerUid]: peerParty.role },
        participantNames: { [user.uid]: senderName, [peerUid]: peerName },
        lastMessageAt: now,
      }
      if (!convSnap.exists) {
        tx.set(convRef, { ...conversationFields, createdAt: now })
      } else {
        tx.update(convRef, conversationFields)
      }
      tx.set(msgRef, {
        conversationId,
        senderUid: user.uid,
        body: messageBody,
        createdAt: now,
        read: false,
      })
    })

    await writeAuditLog({
      action: 'message_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: peerUid,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ conversationId, messageId: msgRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live verify — the full exit-criteria matrix, including the branch-change case**

With the dev server running and real test accounts (reuse Task 2's accounts; add a second branch's `cashier`):

1. Staff → own branch's `branch_manager`: `POST` succeeds (201); a cross-branch attempt to a different branch's `branch_manager` returns 403; an attempt to message another generic staff member returns 403.
2. `branch_manager` → own branch's staff and any `general_manager`: both succeed; a different branch's staff member returns 403.
3. `general_manager` → any `branch_manager`: succeeds org-wide; a direct attempt at a generic staff member returns 403.
4. Any role → `it_admin` and back: both directions succeed.
5. `super_admin` ↔ anyone: succeeds both directions.
6. **Duplicate-conversation check:** call `POST` twice in a row for the same pair; confirm via a direct Firestore read (or the `GET` response) that exactly one `conversations` doc exists for that pair, not two.
7. **Branch-change-closes-conversation check:** establish a valid conversation (e.g. a `cashier` messaging their `branch_manager`), then run a one-off Admin SDK script that calls `auth.setCustomUserClaims(cashierUid, { role: 'cashier', branchId: '<a-different-real-branch-id>', superAdmin: false })` — mirroring this project's existing account-provisioning technique, not a new shipped feature (see "Flagged" section above). Immediately after, `POST` a new message in that same conversation and confirm it now returns 409, and `GET` on that conversation now reports `canReply: false`. Revert the claim afterward if the account needs to keep working for later verification steps.
8. Confirm via the audit log (`GET /api/audit-log` or a direct Firestore read) that each successful `POST` wrote exactly one `message_create` entry, and that no `GET` call wrote any audit entry at all.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/messaging/messages/route.ts
git commit -m "feat(messaging): add GET/POST /api/messaging/messages with live relationship enforcement"
```

---

### Task 4: Notification — Cloud Function trigger

**Files:**
- Create: `functions/src/messageNotifications.ts`
- Modify: `functions/src/index.ts`
- Modify: `src/lib/types/notification.ts`
- Modify: `src/components/notifications/NotificationBell.tsx`

**Interfaces:**
- Consumes: `getFunctionsFirestore` (`./firestore`), `isAlreadyExistsError` (`./idempotent`) — both already exist and are used unchanged, per this task following the exact `onAppointmentScheduled` template.
- Produces: `onMessageSent` export from `functions/src/index.ts`.

- [ ] **Step 1: Write the trigger**

Create `functions/src/messageNotifications.ts`:

```ts
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

const PREVIEW_LENGTH = 80

export const onMessageSent = onDocumentCreated(
  { document: 'messages/{messageId}', database: 'default' },
  async (event) => {
    const message = event.data?.data()
    if (!message) return

    const { conversationId, senderUid, body } = message as {
      conversationId: string
      senderUid: string
      body: string
    }

    const db = getFunctionsFirestore()
    const convSnap = await db.collection('conversations').doc(conversationId).get()
    if (!convSnap.exists) return

    const conversation = convSnap.data() as { participantUids: string[]; participantNames?: Record<string, string> }
    const recipientUid = conversation.participantUids.find((uid) => uid !== senderUid)
    if (!recipientUid) return

    const senderName = conversation.participantNames?.[senderUid] ?? 'A colleague'
    const preview = body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH)}…` : body

    const messageId = event.params.messageId
    const notifRef = db.collection('notifications').doc(`message_received_${messageId}`)
    try {
      await notifRef.create({
        recipientUid,
        type: 'message_received',
        title: `New message from ${senderName}`,
        body: preview,
        relatedId: senderUid,
        read: false,
        createdAt: new Date(),
      })
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
```

- [ ] **Step 2: Export it**

In `functions/src/index.ts`, change:

```ts
export { onPendingDeliveryCreated } from './pendingDeliveryNotifications'
```

to:

```ts
export { onPendingDeliveryCreated } from './pendingDeliveryNotifications'
export { onMessageSent } from './messageNotifications'
```

- [ ] **Step 3: Wire the notification type into the bell**

In `src/lib/types/notification.ts`, change:

```ts
export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed' | 'appointment_scheduled' | 'lab_result_entered' | 'pending_delivery'
```

to:

```ts
export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed' | 'appointment_scheduled' | 'lab_result_entered' | 'pending_delivery' | 'message_received'
```

In `src/components/notifications/NotificationBell.tsx`, change:

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

to:

```ts
const NOTIFICATION_LINKS: Record<NotificationType, (relatedId: string) => string> = {
  low_stock: (relatedId) => `/products/${relatedId}`,
  leave_request_submitted: () => '/leave/review',
  leave_request_reviewed: () => '/leave',
  appointment_scheduled: () => '/appointments',
  lab_result_entered: (relatedId) => `/customers/${relatedId}`,
  pending_delivery: (relatedId) => `/customers/${relatedId}`,
  message_received: (relatedId) => `/messages/${relatedId}`,
}
```

- [ ] **Step 4: Type-check both projects**

Run: `npx tsc --noEmit` (root app)
Run: `cd functions && npx tsc --noEmit` (Cloud Functions project — separate `tsconfig`, per this project's established two-npm-project structure)
Expected: no errors in either.

- [ ] **Step 5: Live verify (post-deploy)**

Deploy per this project's established explicit-go-ahead-each-time policy for `erp-lfd` writes: `firebase deploy --only functions:onMessageSent,firestore:rules,firestore:indexes` (ask before running). After deploy, send a real message via Task 3's route between two real test accounts and confirm a `notifications` doc appears for the recipient with `type: 'message_received'`, and that the bell UI shows it and routes to `/messages/<senderUid>` on click.

- [ ] **Step 6: Commit**

```bash
git add functions/src/messageNotifications.ts functions/src/index.ts src/lib/types/notification.ts src/components/notifications/NotificationBell.tsx
git commit -m "feat(messaging): notify the other participant via Cloud Function on new message"
```

---

### Task 5: UI — conversation list, thread view, nav entry

**Files:**
- Create: `src/components/messaging/ConversationList.tsx`
- Create: `src/components/messaging/ThreadView.tsx`
- Create: `src/app/(dashboard)/messages/page.tsx`
- Create: `src/app/(dashboard)/messages/[peerUid]/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: Task 2's `GET /api/messaging/conversations`, Task 3's `GET`/`POST /api/messaging/messages`, `requireCapability`/`AuthError` for page-level guards, `hasCapability` for the nav filter (unchanged signature).

- [ ] **Step 1: Conversation list component**

Create `src/components/messaging/ConversationList.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ConversationListItem {
  peerUid: string
  peerName: string
  peerRole: string
  lastMessageAt: string | null
  canReply: boolean
}

const POLL_INTERVAL_MS = 15000

export default function ConversationList() {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/messaging/conversations')
      if (!res.ok || cancelled) return
      const body = await res.json()
      setItems(body)
      setLoaded(true)
    }
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const itSupport = items.filter((item) => item.peerRole === 'it_admin')
  const everyoneElse = items.filter((item) => item.peerRole !== 'it_admin')

  if (!loaded) return <p className="text-sm text-slate">Loading contacts…</p>

  function renderGroup(label: string, group: ConversationListItem[]) {
    if (group.length === 0) return null
    return (
      <div className="space-y-2">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate">{label}</h2>
        <ul className="divide-y divide-mist rounded-md border border-mist">
          {group.map((item) => (
            <li key={item.peerUid}>
              <Link
                href={`/messages/${item.peerUid}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-marine/5"
              >
                <span>
                  <span className="font-medium text-ink">{item.peerName}</span>{' '}
                  <span className="text-slate">({item.peerRole})</span>
                  {!item.canReply && <span className="ml-2 text-xs text-danger">no longer available</span>}
                </span>
                {item.lastMessageAt && (
                  <span className="shrink-0 text-xs text-slate">{new Date(item.lastMessageAt).toLocaleString()}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {renderGroup('IT Support', itSupport)}
      {renderGroup('Contacts', everyoneElse)}
      {items.length === 0 && <p className="text-sm text-slate">No one is reachable from your role yet.</p>}
    </div>
  )
}
```

- [ ] **Step 2: Thread view component**

Create `src/components/messaging/ThreadView.tsx`:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'

interface ThreadMessage {
  id: string
  senderUid: string
  body: string
  createdAt: string
}

interface ThreadResponse {
  peer: { uid: string; name: string; role: string }
  canReply: boolean
  messages: ThreadMessage[]
}

const POLL_INTERVAL_MS = 8000

export default function ThreadView({ peerUid, ownUid }: { peerUid: string; ownUid: string }) {
  const [thread, setThread] = useState<ThreadResponse | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notFound = useRef(false)

  async function load() {
    if (notFound.current) return
    const res = await fetch(`/api/messaging/messages?peerUid=${encodeURIComponent(peerUid)}`)
    if (res.status === 404) {
      notFound.current = true
      return
    }
    if (!res.ok) return
    setThread(await res.json())
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerUid])

  async function handleSend() {
    if (!draft.trim()) return
    setSending(true)
    setError(null)
    const res = await fetch('/api/messaging/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerUid, body: draft.trim() }),
    })
    setSending(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to send message.')
      return
    }
    setDraft('')
    await load()
  }

  if (notFound.current) return <p className="text-sm text-slate">This contact is not reachable.</p>
  if (!thread) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="font-display text-lg font-semibold text-ink">
        {thread.peer.name} <span className="text-sm font-normal text-slate">({thread.peer.role})</span>
      </h1>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-mist p-4">
        {thread.messages.length === 0 && <p className="text-sm text-slate">No messages yet.</p>}
        {thread.messages.map((m) => (
          <div key={m.id} className={m.senderUid === ownUid ? 'text-right' : 'text-left'}>
            <div
              className={
                m.senderUid === ownUid
                  ? 'inline-block rounded-md bg-marine px-3 py-2 text-sm text-paper'
                  : 'inline-block rounded-md bg-mist px-3 py-2 text-sm text-ink'
              }
            >
              {m.body}
            </div>
            <div className="text-xs text-slate">{new Date(m.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {thread.canReply ? (
        <div className="space-y-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              className="flex-1 rounded-md border border-mist px-3 py-2 text-sm"
              disabled={sending}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-md bg-marine px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-danger">
          This conversation is no longer available — a participant&apos;s role or branch has changed.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Pages**

Create `src/app/(dashboard)/messages/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import ConversationList from '@/components/messaging/ConversationList'

export default async function MessagesPage() {
  try {
    await requireCapability('messaging.access')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="mx-auto mt-12 max-w-2xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>
      <ConversationList />
    </div>
  )
}
```

Create `src/app/(dashboard)/messages/[peerUid]/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import ThreadView from '@/components/messaging/ThreadView'

export default async function MessageThreadPage({ params }: { params: Promise<{ peerUid: string }> }) {
  const { peerUid } = await params
  let user
  try {
    user = await requireCapability('messaging.access')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="mx-auto mt-12 h-[70vh] max-w-2xl">
      <ThreadView peerUid={peerUid} ownUid={user.uid} />
    </div>
  )
}
```

- [ ] **Step 4: Sidebar entry, visible to every role**

In `src/components/layout/Sidebar.tsx`, add a new icon near the other icon components (after `MegaphoneIcon`):

```tsx
const ChatIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
  </svg>
)
```

Add it as the first entry in `NAV_LINKS` (ahead of `Staff`), since `messaging.access` is granted to every role and this is the one nav item every user should see without hunting for it:

```ts
const NAV_LINKS: NavLink[] = [
  { href: '/messages', label: 'Messages', capability: 'messaging.access', icon: ChatIcon },
  { href: '/staff', label: 'Staff', capability: 'admin.staff.view', icon: UserIcon },
  // ...rest unchanged
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Live verify in the browser**

With the dev server running, sign in as each of the test accounts from Tasks 2-3 and confirm: the `Messages` nav link appears for every role; the IT Support section is visually separated and always shows at least one `it_admin`; sending a message updates the thread and the conversation list's `lastMessageAt` on next poll; a `canReply: false` thread shows the disabled state instead of a compose box.

- [ ] **Step 7: Commit**

```bash
git add src/components/messaging/ConversationList.tsx src/components/messaging/ThreadView.tsx "src/app/(dashboard)/messages/page.tsx" "src/app/(dashboard)/messages/[peerUid]/page.tsx" src/components/layout/Sidebar.tsx
git commit -m "feat(messaging): add conversation list and thread view UI, nav entry for every role"
```

---

## Live Verification Checklist (post-implementation, mirrors this project's established UAT convention)

Run after all 5 tasks are implemented and reviewed, using real `erp-lfd` test accounts (provision per `[[feedback-lfd-erp-uat-wrapup]]`'s established sequence — hex temp passwords, Admin-SDK custom-token sign-in, clean up afterward):

- [ ] Staff member messages own branch's `branch_manager` — succeeds; cross-branch attempt fails; different-staff-member attempt fails.
- [ ] `branch_manager` messages own branch's staff and a `general_manager` — both succeed; other branch's staff fails.
- [ ] `general_manager` messages any `branch_manager` — succeeds org-wide; direct staff attempt fails.
- [ ] Anyone ↔ `it_admin` — both directions succeed.
- [ ] `super_admin` ↔ anyone — both directions succeed.
- [ ] Branch reassignment (via one-off Admin SDK script, not a shipped feature — see "Flagged" section) closes an existing conversation: `POST` returns 409, `GET` reports `canReply: false`.
- [ ] Duplicate-conversation prevention: two `POST`/lookup attempts between the same pair produce exactly one `conversations` doc.
- [ ] `message_create` is audit-logged; no audit entry is written for any `GET`.
- [ ] A new message triggers a `notifications` doc for the other participant via the Cloud Function, with zero changes to any pre-existing route file (`git diff` against `main` should show no changes outside the files listed in this plan's File Structure table).
