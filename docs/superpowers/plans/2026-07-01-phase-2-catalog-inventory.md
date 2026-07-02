# Phase 2 — Catalog & Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rate limiting to the strict login path, then build the product/service catalog and per-branch stock tracking on top of Phase 1's foundation, reusing its role/branch/audit patterns exactly.

**Architecture:** Same modular monolith as Phase 1. Catalog (`products`, `services`, `suppliers`) is org-wide; `productStock` is the one branch-scoped artifact, derived from an append-only `stockMovements` ledger via the same write transaction — never edited directly.

**Tech Stack:** Unchanged from Phase 1 — Next.js App Router, TypeScript, Tailwind, Firebase Auth + Firestore + Admin SDK.

## Global Constraints

- Firestore rules default-deny; every collection needs an explicit rule — no blanket permissive rules
- Every write goes through an Admin-SDK-backed API route with an explicit field whitelist — never `{...body}` spread
- Firebase custom claims are the sole source of truth for authorization; never read Firestore to make an access-control decision
- Enforce role + branch checks at UI, server, and Firestore rules — all three, for every new capability
- No `Math.random()` for security-sensitive values — use a CSPRNG
- No hardcoded credentials or `??` fallback literals in client code
- Every catalog/stock/supplier create/edit/delete produces an audit log entry via the existing `writeAuditLog()` from Phase 1
- No TDD / no automated test suite — manual verification against exit criteria, matching Phase 1

---

## Part A: Rate limiting on `/api/auth/login` (build and review first, separately)

### Design

Only the **strict path** (`super_admin`/`admin`, server-verified password check) is throttled here. The **client-SDK path** (the other 4 roles) never touches our server for password verification — Firebase Auth's own abuse protection (`auth/too-many-requests`) already covers it, and we have no hook to intercept it server-side. This is a deliberate scope boundary, not a gap: throttling the path we actually control.

Two independent counters, checked before any password verification:
- **Per-email** (`login:email:{lowercased email}`) — only recorded when the email belongs to a real `STRICT_AUDIT_ROLES` account (locking out a nonexistent email protects nothing).
- **Per-IP** (`login:ip:{ip}`) — recorded on every failed attempt regardless of account existence, since this is what stops someone hammering many different emails from one source.

Parameters: 5 failed attempts within a 15-minute rolling window → 15-minute lockout. Flat lockout, not exponential backoff — simpler to reason about and verify, and the exit criterion just asks for "blocked rather than allowed indefinitely."

Storage: new Firestore collection `rateLimits/{key}`, Admin-SDK-only (`allow read, write: if false` — no client path at all, not even authenticated reads, since nothing legitimate ever needs to read this).

**Accepted tradeoff (flagged by final review, confirmed):** because the per-email counter locks on the target account regardless of source IP, anyone who knows a `super_admin`/`admin` email can keep that account locked out indefinitely by deliberately failing 5 logins every 15 minutes — the per-IP counter doesn't protect the victim, since the attacker is tripping the *email* key specifically, not the IP key. This is accepted as reasonable for an internal-only ERP with a small, trusted user base; revisit (e.g. IP-only lockout, or a longer cooldown with human-in-the-loop unlock) if this app ever gets a larger or less-trusted admin population.

```ts
// rateLimits/{key} shape
{
  key: string            // == doc id, e.g. "login:email:foo@x.com" or "login:ip:1.2.3.4"
  count: number
  windowStart: Timestamp
  lockedUntil: Timestamp | null
}
```

### Task A1: Rate-limit module + Firestore rule

**Files:**
- Create: `src/lib/auth/rate-limit.ts`
- Modify: `firestore.rules` (add `rateLimits` block)

**Interfaces:**
- Produces: `checkRateLimit(key: string): Promise<{ blocked: boolean; retryAfterMs?: number }>`, `recordFailedAttempt(key: string): Promise<void>`, `clearAttempts(key: string): Promise<void>` — Task A2 calls these three, by these exact names, on `getAdminFirestore().collection('rateLimits')`.

- [ ] **Step 1: `src/lib/auth/rate-limit.ts`**

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000

export async function checkRateLimit(key: string): Promise<{ blocked: boolean; retryAfterMs?: number }> {
  const doc = await getAdminFirestore().collection('rateLimits').doc(key).get()
  if (!doc.exists) return { blocked: false }
  const data = doc.data()!
  const lockedUntil = data.lockedUntil?.toDate?.() as Date | undefined
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return { blocked: true, retryAfterMs: lockedUntil.getTime() - Date.now() }
  }
  return { blocked: false }
}

export async function recordFailedAttempt(key: string): Promise<void> {
  const ref = getAdminFirestore().collection('rateLimits').doc(key)
  await getAdminFirestore().runTransaction(async (tx) => {
    const doc = await tx.get(ref)
    const now = Date.now()
    if (!doc.exists) {
      tx.set(ref, { key, count: 1, windowStart: new Date(now), lockedUntil: null })
      return
    }
    const data = doc.data()!
    const windowStart = data.windowStart?.toDate?.() as Date | undefined
    const withinWindow = windowStart && now - windowStart.getTime() < WINDOW_MS
    const nextCount = withinWindow ? (data.count ?? 0) + 1 : 1
    const nextWindowStart = withinWindow ? windowStart : new Date(now)
    const lockedUntil = nextCount >= MAX_ATTEMPTS ? new Date(now + LOCKOUT_MS) : null
    tx.set(ref, { key, count: nextCount, windowStart: nextWindowStart, lockedUntil })
  })
}

export async function clearAttempts(key: string): Promise<void> {
  await getAdminFirestore().collection('rateLimits').doc(key).delete()
}
```

- [ ] **Step 2: `firestore.rules` — `rateLimits` block** (append before catch-all)

```
match /rateLimits/{key} {
  allow read, write: if false; // Admin SDK only, no client path at all
}
```

- [ ] **Step 3: Manual verification** — `npx tsc --noEmit` clean. Live verification happens in Task A2's step (this module has no standalone UI).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/rate-limit.ts firestore.rules
git commit -m "feat: rate-limit module for login throttling (email + IP, Firestore-backed)"
```

### Task A2: Wire rate limiting into `/api/auth/login`

**Files:**
- Modify: `src/app/api/auth/login/route.ts`

**Interfaces:**
- Consumes: `checkRateLimit`, `recordFailedAttempt`, `clearAttempts` from Task A1.

- [ ] **Step 1: Extract client IP and check both keys before touching `getUserByEmail`**

At the top of the `POST` handler, after parsing `{ email, password }`:

```ts
const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
const emailKey = `login:email:${email.toLowerCase()}`
const ipKey = `login:ip:${ip}`

const [emailLimit, ipLimit] = await Promise.all([checkRateLimit(emailKey), checkRateLimit(ipKey)])
if (emailLimit.blocked || ipLimit.blocked) {
  return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
}
```

This runs before the existing `auth/user-not-found` branch — an attacker probing a locked-out email still gets the generic 429, not the `{strategy: 'client_sdk'}` response, but that's fine: the two response shapes were only required to be indistinguishable from each other for *unlocked* accounts; a 429 is a distinct, expected state.

- [ ] **Step 2: Record failures, clear on success**

- In the `auth/user-not-found` catch branch: `await recordFailedAttempt(ipKey)` before returning `{strategy: 'client_sdk'}` (don't record the email key — the email isn't a real strict-role account).
- In the password-verification-failed branch (`!signInRes.ok`): `await Promise.all([recordFailedAttempt(emailKey), recordFailedAttempt(ipKey)])` before returning the 401.
- In the success branch, right before minting the session cookie: `await Promise.all([clearAttempts(emailKey), clearAttempts(ipKey)])`.
- The unexpected-error branch (503, from the earlier fail-closed fix) does **not** record an attempt — that's an infra failure, not a credential guess.

- [ ] **Step 2: Manual verification**

- `npx tsc --noEmit` clean.
- Script 6 rapid POSTs to `/api/auth/login` with the real `super_admin` email and a wrong password. Confirm attempts 1–5 return 401, attempt 6 returns 429 with a `retryAfterMs`-implying message, and a correct-password attempt made immediately after also returns 429 (the lockout blocks the account, not just repeats of the same wrong password).
- Confirm a successful login after the window expires (or after manually clearing the `rateLimits` doc) works again.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth/login/route.ts
git commit -m "feat: throttle repeated failed logins on the strict auth path"
```

---

## Part B: Catalog & Inventory

## Firestore Collections

**`products/{productId}`** — org-wide, not branch-scoped
```ts
{
  name: string
  sku: string
  category: string
  unitCost: number
  price: number
  supplierId: string | null
  reorderThreshold: number
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
```
Note: Firestore has no native unique-constraint mechanism. SKU uniqueness is enforced at the API layer with a pre-write query (`where('sku', '==', value).limit(1)`) — not airtight under concurrent creates of the same SKU, but adequate for Phase 2's single-operator-at-a-time reality. Flagging this as a known, accepted limitation rather than building a transaction-based uniqueness lock, which would be over-engineering for the current scale.

**`productStock/{branchId}_{productId}`** — composite, deterministic doc ID (no query needed to find "the" stock doc for a branch+product pair)
```ts
{
  branchId: string
  productId: string
  quantity: number   // derived — only ever written by the stock-movement transaction, never by an edit form
  updatedAt: Timestamp
}
```

**`stockMovements/{movementId}`** — auto-ID, append-only
```ts
{
  productId: string
  branchId: string
  type: 'restock' | 'adjustment' | 'waste'
  quantityDelta: number   // positive for restock; negative for waste; either sign for adjustment
  reason: string | null
  actorUid: string
  createdAt: Timestamp
}
```
`productStock.quantity` stays in sync via `FieldValue.increment(quantityDelta)` applied in the **same Firestore transaction** that creates the movement doc — not recomputed by summing the ledger on every read (would get slower as history grows). This is the mechanism that makes "displayed quantity always equals the sum of movements" a maintained invariant rather than a live aggregation.

**`services/{serviceId}`** — org-wide, no stock concept
```ts
{
  name: string
  category: string
  price: number
  durationMinutes: number
  description: string | null
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**`suppliers/{supplierId}`**
```ts
{
  name: string
  contact: { phone: string | null; email: string | null; address: string | null }
  notes: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## Permissions (revised per your decision)

Add to `src/lib/auth/permissions.ts`'s `Capability` union and `ROLE_CAPABILITIES`, under the already-reserved `inventory` module:

```ts
'inventory.catalog.manage'    // products + services CRUD — super_admin, admin ONLY
'inventory.suppliers.manage'  // super_admin, admin, branch_manager (unchanged from original plan — not touched by your decision)
'inventory.stock.view'        // super_admin, admin, branch_manager
'inventory.stock.adjust'      // restock / correction / waste — super_admin, admin, branch_manager
'inventory.stock.transfer'    // super_admin, admin, branch_manager — branch_manager restricted to their own branch as SOURCE (see below)
```

`branch_manager` no longer gets `inventory.catalog.manage` — global pricing/SKU changes are `admin`/`super_admin` only now.

### Stock transfer — new mechanic, not in the original scope text

A transfer moves quantity from one branch to another, which the original `stockMovements` shape (one `branchId` per entry) can't represent as a single row without breaking the "quantity = sum of this branch's movements" invariant per branch. Resolving this by extending `stockMovements.type` to include `'transfer_out' | 'transfer_in'` alongside the original three, and creating **two linked entries in one transaction** — a `transfer_out` at the source branch (negative `quantityDelta`) and a `transfer_in` at the destination branch (positive `quantityDelta`), sharing a `transferId`, each also updating that branch's `productStock.quantity` in the same transaction. Both branches' per-branch sum-of-movements invariant stays intact; the transfer is just two ordinary ledger entries that happen to be created together.

**Judgment call on "branch scoped only" (your phrasing didn't fully specify this, flagging my interpretation rather than silently deciding):** a `branch_manager` may only initiate a transfer where the **source** branch (`branchId`, the one losing stock) is their own `user.branchId` — the destination can be any other branch. `admin`/`super_admin` can transfer between any two branches. This mirrors the existing pattern where a branch_manager only ever acts on their own branch's data; there's no approval/request workflow in Phase 2 (out of scope, matching "no purchase-order workflow yet" for suppliers) — a transfer takes effect immediately once created.

On a dedicated inventory role: still not needed — `branch_manager` keeps a coherent, narrower scope (their own branch's stock operations, not the global catalog), which is a cleaner boundary than before, if anything.

## Firestore Rules Reasoning

- `products`, `services`, `suppliers`: **read — any authenticated user**, same as `departments`/`branches` in Phase 1 — catalog browsing isn't sensitive, and multiple roles/future POS work will need to read it broadly. Write: `if false`.
- `productStock`, `stockMovements`: **read — branch-scoped** (`request.auth.token.branchId == resource.data.branchId`), matching `staff`'s pattern. Reasoning: stock levels and movement history reveal operational volume/velocity per branch — treating it with the same sensitivity as staff/department data, not the open-read treatment given to the catalog itself. Write: `if false` on both, always.

## Build Order

1. Rate limiting (Part A above) — standalone, reviewed first
2. Permissions: add the three `inventory.*` capabilities
3. Suppliers CRUD (simplest, no dependencies, reuses the Departments pattern exactly)
4. Products catalog CRUD (references `supplierId`; SKU uniqueness check)
5. Services catalog CRUD (simplest — no stock, no movements)
6. `productStock` + `stockMovements` — the ledger-derived-quantity mechanic, built after the simpler CRUD patterns are proven
7. Stock view UI: per-branch quantities, low-stock flag, manual adjustment form (restock/adjustment/waste)
8. Nav wiring: add capability-gated Sidebar links for Products, Services, Suppliers, Stock
9. Full exit-criteria verification pass, including the rate-limit script test

---

## Open questions (flagging per your instruction, not guessing)

- **Services and appointment scheduling**, per your explicit ask: building services as "walk-in, sold at time of service" (a price + duration on a catalog line, no calendar/slot concept) — there is no scheduling, booking, or calendar model anywhere in this plan. If services actually need appointment scheduling, that reshapes both this phase (services would need a duration→slot relationship, staff/resource assignment, and a bookings collection) and POS more significantly than a walk-in model would. Flagging explicitly rather than guessing which one you want: **do services get booked in advance, or are they walk-in/at-time-of-service only?**
- SKU uniqueness is enforced by a pre-write query, not a hard constraint — acceptable for Phase 2's scale, flagged above.
- `inventory.catalog.manage` granting branch_manager org-wide catalog write access — flagged above, implementing as specified.
- POS/checkout, CRM, accounting, purchase-order workflow for suppliers — correctly out of scope, not touched.
- `docs/project-brief.md` still doesn't exist — proceeding on CLAUDE.md alone, as in Phase 1.
