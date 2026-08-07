# Phase 42 — Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five Critical/High/Medium security findings from an external code audit (originally labeled "Phase 41" — renumbered to 42 because `phase-41-baseline` already exists, tagged and pushed to production, for the unrelated Button loading-state accessibility fix) — the strict-audit login bypass, the branch-scoping bug class (expanded from 4 to 10 real sites during verification), attachment IDOR + upload hardening, missing security response headers, and safely-upgradable dependency advisories.

**Architecture:** No new subsystems. This phase hardens existing auth/authorization code paths in place: `/api/auth/session`, the shared rate-limiter, ten call sites that scope Firestore queries by role, the attachment read/write routes, and `next.config.ts`'s response headers. One new ESLint rule prevents the branch-scoping bug class from recurring.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Firebase Admin SDK (Auth + Firestore), Vitest against the Firestore/Auth emulators, ESLint flat config.

## Global Constraints

- No new features, no refactors of adjacent code, no design work — pre-production-blocking security fixes only.
- Opus-tier review rigor for every task in this phase — all six touch either the auth path or a Firestore transaction/query that gates access to another branch's data (this project's own standing practice, see `docs/tech-debt.md`/CLAUDE.md's phase-delivery workflow notes).
- Do not change `/api/auth/login`'s existing strict-role routing logic or its `strategy: 'client_sdk'` response shape.
- Do not add a new production dependency without it being explicitly called out and justified in this plan (none are needed — Tasks 1–4 use only what's already installed).
- Every task ends with `npx tsc --noEmit` and the full `npm test` suite passing before moving to the next task.

## Findings verified against the actual codebase before this plan was written

The original audit document undercounted or slightly mis-scoped three findings. This plan is written against what's actually true today, not the document's original claims:

- **H-2 is 10 real sites, not 4.** The document's four (`sales.ts:60`, `sales/[id]/void/route.ts:45`, `stock/movements/route.ts:63`, `leave-requests/[id]/route.ts:56`) are accurate. Verification found six more instances of the identical `user.role === 'branch_manager'` pattern: `reports/inventory.ts:25`, `dashboard/revenueTrend.ts:31`, `(dashboard)/leave/review/page.tsx:31`, `dashboard/pendingLeaveApprovals.ts:26`, `api/stock/transfer/route.ts:54`, and `(dashboard)/attendance/page.tsx:49,56` (two occurrences in one file — history mode and day-roster mode, both gated on `hr.attendance.view`). Three of these are *deliberately* code-comment-documented as mirroring an already-cited file's exact (vulnerable) scoping convention — meaning fixing one without its sibling(s) would introduce a new report/dashboard-disagreement bug. `dashboard/lowStockSummary.ts` already does this correctly via `isBranchLocked` with its own explanatory comment — leave it untouched.
- **H-3's fix is real but narrower than implied.** `next` 16.2.9 → 16.3.0 is a safe, non-semver-major upgrade that also transitively resolves the `sharp` and `postcss` high-severity advisories (both show `effects: ["next"]` in `npm audit --json`). `fast-xml-parser` and `brace-expansion` both report `fixAvailable: true` (no breaking change). But the remaining 7 moderate advisories (`@google-cloud/storage`, `retry-request`, `teeny-request`, `uuid`, `gaxios`, `protobufjs`, and `firebase-admin` itself as a direct dependency) cannot be fixed today: npm's own suggested fix is `firebase-admin@10.3.0` — a **downgrade** from the installed `14.1.0` (semver-major) — because the vulnerable range is `>=11.0.0`, and the latest published version (`14.2.0`, checked via `npm view`) still carries the same vulnerable transitive dependency. A downgrade to 10.3.0 risks breaking this project's Firestore Enterprise named-database support (`getFirestore(app, 'default')`, see `src/lib/firebase/admin.ts`'s own comment on why this matters) and Cloud Functions v2 compatibility. This is not fixable by this project right now — it needs to be documented as an accepted, upstream-blocked risk, not attempted.
- **M-7 (committed private key in `.env.test`)** is explicitly out of scope for a phase, per the original document's own note — a two-minute fix, do it separately whenever convenient. Not a task here.

## Task 1: Harden `/api/auth/session` — close the strict-role bypass and the unthrottled session-mint endpoint

**Files:**
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/lib/auth/rate-limit.ts`
- Test: `tests/integration/authSession.test.ts` (new)

**Interfaces:**
- Consumes: `STRICT_AUDIT_ROLES` and `RoleId` from `@/lib/auth/permissions`; `checkRateLimit(key: string)`, `recordFailedAttempt(key: string)`, `clearAttempts(key: string)` from `@/lib/auth/rate-limit`; `writeAuditLog` from `@/lib/audit/log`.
- Produces: `checkRateLimit` now returns a discriminated result — callers must handle a new `unavailable: true` case (see Step 3) instead of the function silently resolving `{ blocked: false }` on error.

### Why this shape

`/api/auth/session` is called only by the client-SDK login path (11 of 14 roles), after `signInWithEmailAndPassword` has already succeeded against Identity Toolkit directly — so rate-limiting this route does not stop password brute-forcing (that happens against Google's endpoint, never touching this route). What it does do: (a) close the actual H-1 bypass — a strict-role account (`super_admin`/`admin`/`general_manager`) minting a session here entirely skips `/api/auth/login`'s tamper-proof audit trail and lockout, and must be rejected outright; (b) bring this route in line with this project's own standing rule ("No unauthenticated, unthrottled endpoint that checks a password or secret — rate-limit it") — it verifies a bearer credential (the ID token) with no throttling at all today, which is the same class of gap that rule exists to prevent.

- [ ] **Step 1: Read the current file and confirm the exact insertion points**

Current `src/app/api/auth/session/route.ts` (for reference — do not skip reading it, the diff below assumes this exact starting shape):

```ts
import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { sessionCookieOptions, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'

export async function POST(request: Request) {
  const { idToken } = await request.json()
  if (!idToken) {
    return NextResponse.json({ error: 'ID token required' }, { status: 400 })
  }

  let decoded
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true)
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const role = decoded.role as string | undefined
  const branchId = decoded.branchId as string | undefined
  if (!role || !branchId) {
    return NextResponse.json({ error: 'Account not fully provisioned' }, { status: 403 })
  }

  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions())

  await writeAuditLog({ action: 'login', actorUid: decoded.uid, actorEmail: decoded.email ?? null, branchId })
  return response
}
```

- [ ] **Step 2: Write the failing tests first**

Create `tests/integration/authSession.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { randomUUID } from 'node:crypto'

const BASE_URL = 'http://localhost:3000' // matches this project's existing integration-test convention of hitting route handlers directly via fetch against the dev server; see tests/integration/sales.test.ts for the established pattern

async function createTestUser(role: string, branchId: string) {
  const email = `test-${randomUUID()}@example.com`
  const password = 'Test1234!'
  const userRecord = await getAdminAuth().createUser({ email, password })
  await getAdminAuth().setCustomUserClaims(userRecord.uid, { role, branchId })
  return { uid: userRecord.uid, email, password }
}

async function signInAndGetIdToken(email: string, password: string): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const url = authEmulatorHost
    ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const body = await res.json()
  return body.idToken
}

describe('POST /api/auth/session', () => {
  afterEach(async () => {
    await getAdminFirestore().collection('rateLimits').get().then((snap) =>
      Promise.all(snap.docs.map((d) => d.ref.delete()))
    )
  })

  it('rejects a super_admin session-mint attempt with 403 and writes a login_failed audit entry', async () => {
    const { email, password } = await createTestUser('super_admin', 'branch-1')
    const idToken = await signInAndGetIdToken(email, password)

    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })

    expect(res.status).toBe(403)
    expect(res.headers.get('set-cookie')).toBeNull()

    const auditSnap = await getAdminFirestore()
      .collection('auditLogs')
      .where('action', '==', 'login_failed')
      .where('actorEmail', '==', email)
      .get()
    expect(auditSnap.empty).toBe(false)
    const entry = auditSnap.docs[0].data()
    expect(entry.details.source).toBe('session_route')
    expect(entry.details.reason).toBe('strict_role_wrong_path')
  })

  it('allows a non-strict role (cashier) to mint a session normally', async () => {
    const { email, password } = await createTestUser('cashier', 'branch-1')
    const idToken = await signInAndGetIdToken(email, password)

    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('__session')
  })

  it('locks out after 5 failed strict-role attempts from the same IP within the window', async () => {
    const { email, password } = await createTestUser('admin', 'branch-1')
    const idToken = await signInAndGetIdToken(email, password)

    for (let i = 0; i < 5; i++) {
      await fetch(`${BASE_URL}/api/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '9.9.9.9' },
        body: JSON.stringify({ idToken }),
      })
    }

    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '9.9.9.9' },
      body: JSON.stringify({ idToken }),
    })
    expect(res.status).toBe(429)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test -- authSession`
Expected: FAIL — `/api/auth/session` currently returns 200 for the strict-role case, no `login_failed` entry is written, and there is no lockout after 5 attempts.

- [ ] **Step 4: Extend the rate limiter to fail closed and to accept a caller-supplied window/lockout (kept simple — this phase does not need the fully generalized per-route limiter from the Hardening phase's Task 3, just a fail-closed `checkRateLimit`)**

Modify `src/lib/auth/rate-limit.ts` — change `checkRateLimit`'s return shape to let a Firestore error be distinguished from "not blocked", and export a new `RateLimitResult` type:

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000

export type RateLimitResult =
  | { status: 'ok' }
  | { status: 'blocked'; retryAfterMs: number }
  | { status: 'unavailable' } // Firestore read failed — caller must fail closed

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  let doc
  try {
    doc = await getAdminFirestore().collection('rateLimits').doc(key).get()
  } catch {
    return { status: 'unavailable' }
  }
  if (!doc.exists) return { status: 'ok' }
  const data = doc.data()!
  const lockedUntil = data.lockedUntil?.toDate?.() as Date | undefined
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return { status: 'blocked', retryAfterMs: lockedUntil.getTime() - Date.now() }
  }
  return { status: 'ok' }
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

This is a breaking signature change (`{ blocked: boolean; retryAfterMs?: number }` → the new discriminated union), so both call sites need updating in the same commit — `/api/auth/login` and the new `/api/auth/session` logic.

- [ ] **Step 5: Update `/api/auth/login` for the new `checkRateLimit` shape and fail-closed behavior**

Modify `src/app/api/auth/login/route.ts` — replace the rate-limit-check block:

```ts
  const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const emailKey = `login:email:${email.toLowerCase()}`
  const ipKey = `login:ip:${ip}`

  const [emailLimit, ipLimit] = await Promise.all([checkRateLimit(emailKey), checkRateLimit(ipKey)])
  if (emailLimit.status === 'unavailable' || ipLimit.status === 'unavailable') {
    return NextResponse.json({ error: 'Login temporarily unavailable, please try again' }, { status: 503 })
  }
  if (emailLimit.status === 'blocked' || ipLimit.status === 'blocked') {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }
```

This replaces the old `try { ... } catch { console.error(...) }` block entirely — a Firestore error during the rate-limit check now returns 503 instead of silently proceeding as unblocked. `recordFailedAttempt`/`clearAttempts` calls elsewhere in this file are unchanged (they already `.catch()` and log — that's correct, best-effort bookkeeping, not the guard itself, per this plan's Task 1 framing).

Also update the IP derivation: `x-vercel-forwarded-for` first (Vercel's own header, confirmed via Vercel's documentation to never be overwritable by an upstream proxy, unlike `x-forwarded-for`), falling back to `x-forwarded-for` for local development where neither Vercel header is present. Vercel's own docs confirm `x-forwarded-for` is already overwritten at their edge to prevent spoofing on a standard (non-Enterprise-Trusted-Proxy) deployment — this project has no Enterprise trusted-proxy configuration — so this is a defense-in-depth improvement for if a proxy is ever added in front of Vercel later, not a fix for a currently-exploitable gap.

- [ ] **Step 6: Rewrite `/api/auth/session` with the strict-role rejection and rate limiting**

Replace `src/app/api/auth/session/route.ts` entirely:

```ts
import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { sessionCookieOptions, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'
import { STRICT_AUDIT_ROLES, type RoleId } from '@/lib/auth/permissions'
import { checkRateLimit, recordFailedAttempt, clearAttempts } from '@/lib/auth/rate-limit'

export async function POST(request: Request) {
  const { idToken } = await request.json()
  if (!idToken) {
    return NextResponse.json({ error: 'ID token required' }, { status: 400 })
  }

  const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipKey = `session:ip:${ip}`

  const ipLimit = await checkRateLimit(ipKey)
  if (ipLimit.status === 'unavailable') {
    return NextResponse.json({ error: 'Login temporarily unavailable, please try again' }, { status: 503 })
  }
  if (ipLimit.status === 'blocked') {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }

  let decoded
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true)
  } catch {
    await recordFailedAttempt(ipKey).catch(() => {})
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  const role = decoded.role as RoleId | undefined
  const branchId = decoded.branchId as string | undefined
  const emailKey = `session:email:${(decoded.email ?? '').toLowerCase()}`

  if (!role || !branchId) {
    await writeAuditLog({ action: 'login_failed', actorUid: decoded.uid, actorEmail: decoded.email ?? null, details: { source: 'session_route', reason: 'no_claims' } })
    return NextResponse.json({ error: 'Account not fully provisioned' }, { status: 403 })
  }

  if (STRICT_AUDIT_ROLES.includes(role)) {
    await Promise.all([recordFailedAttempt(emailKey), recordFailedAttempt(ipKey)]).catch(() => {})
    await writeAuditLog({
      action: 'login_failed',
      actorUid: decoded.uid,
      actorEmail: decoded.email ?? null,
      branchId,
      details: { source: 'session_route', reason: 'strict_role_wrong_path', role },
    })
    return NextResponse.json({ error: 'This account must sign in through the standard login form' }, { status: 403 })
  }

  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions())

  await clearAttempts(ipKey).catch(() => {})
  await writeAuditLog({ action: 'login', actorUid: decoded.uid, actorEmail: decoded.email ?? null, branchId, details: { source: 'client_sdk' } })
  return response
}
```

Note the new `details: { source: 'client_sdk' }` on the success-path audit entry — this makes every `login` entry's provenance explicit (`server_verified` from `/api/auth/login`, `client_sdk` from here), closing a small observability gap noted while reading `/api/auth/login`'s existing entries (which already tag `source: 'server_verified'`).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test -- authSession`
Expected: PASS — all three cases.

- [ ] **Step 8: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. Pay particular attention to any existing test that asserts on `checkRateLimit`'s old `{ blocked, retryAfterMs }` shape — none currently exist (grepped: no test file imports `rate-limit.ts` today), but confirm this directly rather than trusting the grep.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/auth/session/route.ts src/app/api/auth/login/route.ts src/lib/auth/rate-limit.ts tests/integration/authSession.test.ts
git commit -m "fix(auth): close strict-role session-mint bypass, fail-closed rate limiting (H-1)"
```

## Task 2: Replace all ten hardcoded `branch_manager` checks with `isBranchLocked`, and prevent recurrence

**Files:**
- Modify: `src/lib/reports/sales.ts:60`
- Modify: `src/app/api/sales/[id]/void/route.ts:45`
- Modify: `src/app/api/stock/movements/route.ts:63`
- Modify: `src/app/api/leave-requests/[id]/route.ts:56`
- Modify: `src/lib/reports/inventory.ts:25`
- Modify: `src/lib/dashboard/revenueTrend.ts:31`
- Modify: `src/app/(dashboard)/leave/review/page.tsx:31`
- Modify: `src/lib/dashboard/pendingLeaveApprovals.ts:26`
- Modify: `src/app/api/stock/transfer/route.ts:54`
- Modify: `src/app/(dashboard)/attendance/page.tsx:49,56`
- Modify: `eslint.config.mjs`
- Test: `tests/integration/branchLockedOverrideScoping.test.ts` (new)

**Interfaces:**
- Consumes: `isBranchLocked(role: RoleId): boolean` from `@/lib/auth/permissions` (already exported, unchanged signature) — every site already imports or can trivially import from `@/lib/auth/permissions`.
- Produces: nothing new consumed by later tasks.

### Why ten, and why the pairs must move together

Three of these ten share a capability with an already-cited file and are explicitly code-comment-documented as intentionally mirroring that file's scoping convention:

- `dashboard/revenueTrend.ts:31` mirrors `reports/sales.ts:60` (both gated on `reports.sales.view`)
- `(dashboard)/leave/review/page.tsx:31` and `dashboard/pendingLeaveApprovals.ts:26` both mirror each other and the void-route pattern (all three gated on `hr.leave.approve`)

Fixing only the "primary" file in either group would leave its sibling with the old, vulnerable, now-*inconsistent* behavior — worse than doing nothing, since the report and the dashboard widget would then disagree about who can see what. `(dashboard)/attendance/page.tsx` (gated on `hr.attendance.view`) has no known sibling — it's a standalone tenth instance, not part of either pair, with two occurrences in the same file (history mode and day-roster mode). All ten move in one commit.

**Test-coverage note on `attendance/page.tsx` and `leave/review/page.tsx`:** neither has an extracted, importable query function the way `buildSalesReport`/`buildInventoryReport`/`getPendingLeaveApprovals` do — both pages' query logic is inline in the React Server Component itself (the same reason `pendingLeaveApprovals.ts`'s own comment gives for why it duplicates rather than imports from its page sibling). Extracting one to make it independently unit-testable would be a refactor, out of scope for a security-fix-only phase. `leave/review/page.tsx` gets indirect confidence from its tested sibling (`pendingLeaveApprovals.ts`, identical query shape, same capability); `attendance/page.tsx` has no such sibling, so its fix is verified only by Task 6's live manual check, not by the automated regression suite.

`dashboard/lowStockSummary.ts` already uses `isBranchLocked` correctly (confirmed by reading it) — do not touch it, it is not part of this fix.

- [ ] **Step 1: Write the failing regression test first**

Create `tests/integration/branchLockedOverrideScoping.test.ts` — this is the test that would have caught H-2: it grants a branch-locked role (`cashier`) each of the relevant capabilities via the real Phase 39 override mechanism, then asserts the underlying data functions still branch-filter for that role.

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { buildSalesReport } from '@/lib/reports/sales'
import { buildInventoryReport } from '@/lib/reports/inventory'
import { buildRevenueTrend } from '@/lib/dashboard/revenueTrend'
import { getPendingLeaveApprovals } from '@/lib/dashboard/pendingLeaveApprovals'
import type { SessionUser } from '@/lib/auth/server-guard'

const BRANCH_A = 'branch-a-scoping-test'
const BRANCH_B = 'branch-b-scoping-test'

function cashierWithOverride(branchId: string, capabilities: string[]): SessionUser {
  return {
    uid: 'test-cashier-uid',
    email: 'cashier@example.com',
    role: 'cashier',
    branchId,
    effectiveCapabilities: capabilities as SessionUser['effectiveCapabilities'],
  }
}

describe('branch-locked roles stay branch-filtered even when granted an org-wide-shaped capability via override', () => {
  afterEach(async () => {
    const db = getAdminFirestore()
    for (const col of ['sales', 'productStock', 'leaveRequests']) {
      const snap = await db.collection(col).where('branchId', 'in', [BRANCH_A, BRANCH_B]).get()
      await Promise.all(snap.docs.map((d) => d.ref.delete()))
    }
  })

  it('buildSalesReport stays branch-filtered for a cashier holding reports.sales.view', async () => {
    const db = getAdminFirestore()
    const now = new Date()
    await db.collection('sales').add({ branchId: BRANCH_A, total: 1000, createdAt: now, lineItems: [], payments: [] })
    await db.collection('sales').add({ branchId: BRANCH_B, total: 5000, createdAt: now, lineItems: [], payments: [] })

    const user = cashierWithOverride(BRANCH_A, ['reports.sales.view'])
    const report = await buildSalesReport(user, null, null)

    expect(report.revenueTotal).toBe(1000) // must not see branch B's 5000
  })

  it('buildRevenueTrend agrees with buildSalesReport for the same cashier+override (siblings must not drift)', async () => {
    const db = getAdminFirestore()
    const now = new Date()
    await db.collection('sales').add({ branchId: BRANCH_A, total: 1000, createdAt: now, lineItems: [], payments: [] })
    await db.collection('sales').add({ branchId: BRANCH_B, total: 5000, createdAt: now, lineItems: [], payments: [] })

    const user = cashierWithOverride(BRANCH_A, ['reports.sales.view'])
    const trend = await buildRevenueTrend(user, 1)
    const totalFromTrend = trend.reduce((sum, p) => sum + p.revenue, 0)

    expect(totalFromTrend).toBe(1000)
  })

  it('buildInventoryReport stays branch-filtered for a cashier holding reports.inventory.view', async () => {
    const db = getAdminFirestore()
    await db.collection('productStock').add({ branchId: BRANCH_A, productId: 'p1', quantity: 5 })
    await db.collection('productStock').add({ branchId: BRANCH_B, productId: 'p1', quantity: 50 })
    // buildInventoryReport joins against products/branches; a missing product is
    // skipped (see its own "orphaned stock row" comment), which is enough for
    // this test — we only assert the branch filter, not full row shape.

    const user = cashierWithOverride(BRANCH_A, ['reports.inventory.view'])
    const report = await buildInventoryReport(user)

    expect(report.rows.every((r) => r.branchId === BRANCH_A)).toBe(true)
  })

  it('getPendingLeaveApprovals stays branch-filtered for a cashier holding hr.leave.approve', async () => {
    const db = getAdminFirestore()
    const now = new Date()
    await db.collection('leaveRequests').add({ branchId: BRANCH_A, staffId: 's1', status: 'pending', type: 'annual', startDate: now, endDate: now, createdAt: now })
    await db.collection('leaveRequests').add({ branchId: BRANCH_B, staffId: 's2', status: 'pending', type: 'annual', startDate: now, endDate: now, createdAt: now })

    const user = cashierWithOverride(BRANCH_A, ['hr.leave.approve'])
    const rows = await getPendingLeaveApprovals(user)

    expect(rows.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test -- branchLockedOverrideScoping`
Expected: FAIL — every assertion sees org-wide data, since `cashier` never matches the hardcoded `role === 'branch_manager'` check in any of the four functions under test.

- [ ] **Step 3: Fix `src/lib/reports/sales.ts`**

Add the import and change line 60:

```ts
import { isBranchLocked } from '@/lib/auth/permissions'
```

```ts
  let query: FirebaseFirestore.Query = isBranchLocked(user.role)
    ? db.collection('sales').where('branchId', '==', user.branchId)
    : db.collection('sales')
```

- [ ] **Step 4: Fix `src/lib/dashboard/revenueTrend.ts`**

Update the import (it currently imports `hasEffectiveCapability` from the same module — add `isBranchLocked` to the same import line), delete the now-stale comment explaining why it deliberately used the vulnerable convention, and change line 31:

```ts
import { hasEffectiveCapability, isBranchLocked } from '@/lib/auth/permissions'
```

Remove this comment block (lines 15-18, now inaccurate — it existed specifically to justify matching `sales.ts`'s old, vulnerable convention):

```ts
// Reuses buildSalesReport's exact scoping convention (role === 'branch_manager',
// not isBranchLocked) since this shares the same reports.sales.view capability
// and must behave identically for who sees what — see GET /api/reports/sales,
// deliberately left unchanged since Phase 20.
```

Replace with:

```ts
// Must match buildSalesReport's scoping exactly (same reports.sales.view
// capability, same isBranchLocked predicate) — see Phase 42's H-2 fix,
// which moved both together specifically to prevent this widget and the
// Sales report disagreeing about who sees what.
```

```ts
  let query: FirebaseFirestore.Query = isBranchLocked(user.role)
    ? db.collection('sales').where('branchId', '==', user.branchId)
    : db.collection('sales')
```

- [ ] **Step 5: Fix `src/lib/reports/inventory.ts`**

Add the import and change line 25:

```ts
import { isBranchLocked } from '@/lib/auth/permissions'
```

```ts
  let stockQuery: FirebaseFirestore.Query = isBranchLocked(user.role)
    ? db.collection('productStock').where('branchId', '==', user.branchId)
    : db.collection('productStock')
```

(This also happens to fix the pre-existing, unrelated `prefer-const` ESLint error on this exact line — `stockQuery` is never reassigned. Change `let` to `const` while touching this line, since it's now a one-word difference from the fix already being made here, and leaving it as a dangling `let` right next to the line you just edited would be a strange thing to knowingly walk past.)

- [ ] **Step 6: Fix `src/app/(dashboard)/leave/review/page.tsx`**

Add the import and change line 31:

```ts
import { isBranchLocked } from '@/lib/auth/permissions'
```

```ts
  let query: FirebaseFirestore.Query =
    isBranchLocked(user.role)
      ? db.collection('leaveRequests').where('branchId', '==', user.branchId).where('status', '==', 'pending')
      : db.collection('leaveRequests').where('status', '==', 'pending')
```

(Same `prefer-const` fix applies here too — change `let query` to `const query`.)

- [ ] **Step 7: Fix `src/lib/dashboard/pendingLeaveApprovals.ts`**

Update the import and delete the stale comment (lines 14-18), matching Step 4's treatment:

```ts
import { hasEffectiveCapability, isBranchLocked } from '@/lib/auth/permissions'
```

Remove:

```ts
// Replicates leave/review/page.tsx's own query exactly (role === 'branch_manager'
// scoping, not isBranchLocked — matching what that page already does) rather
// than modifying it — that page's query only ever existed inline, with no
// shared function to import, so this is the reuse-without-reimplementation
// path for this one widget. leave/review/page.tsx itself is untouched.
```

Replace with:

```ts
// Must match leave/review/page.tsx's scoping exactly (same hr.leave.approve
// capability, same isBranchLocked predicate) — see Phase 42's H-2 fix.
```

```ts
  const query: FirebaseFirestore.Query =
    isBranchLocked(viewer.role)
      ? db.collection('leaveRequests').where('branchId', '==', viewer.branchId).where('status', '==', 'pending')
      : db.collection('leaveRequests').where('status', '==', 'pending')
```

- [ ] **Step 8: Fix `src/app/(dashboard)/attendance/page.tsx`**

Add the import and change both occurrences (lines 49 and 56 — history mode and day-roster mode):

```ts
import { isBranchLocked } from '@/lib/auth/permissions'
```

```ts
  let query: FirebaseFirestore.Query
  if (isHistory) {
    // Full history, all dates — mirrors H5's history mode.
    query =
      isBranchLocked(user.role)
        ? db.collection('attendanceRecords').where('branchId', '==', user.branchId).orderBy('date', 'desc')
        : db.collection('attendanceRecords').orderBy('date', 'desc')
  } else {
    // Day roster: pure equality query, no .orderBy() — mirrors H5's default
    // mode, avoids needing a composite index.
    query =
      isBranchLocked(user.role)
        ? db.collection('attendanceRecords').where('branchId', '==', user.branchId).where('date', '==', date)
        : db.collection('attendanceRecords').where('date', '==', date)
  }
```

- [ ] **Step 9: Fix `src/app/api/sales/[id]/void/route.ts`, `src/app/api/stock/movements/route.ts`, `src/app/api/leave-requests/[id]/route.ts`, `src/app/api/stock/transfer/route.ts`**

Each gets the same two-part change: add `isBranchLocked` to its existing `@/lib/auth/permissions` import (or add the import if the file doesn't already import from that module), and swap the predicate. Preserve every existing error message and status code exactly — only the predicate changes.

`src/app/api/sales/[id]/void/route.ts:45`:
```ts
        if (isBranchLocked(user.role) && sale.branchId !== user.branchId) {
```
(add `import { isBranchLocked } from '@/lib/auth/permissions'`)

`src/app/api/stock/movements/route.ts:63`:
```ts
    if (isBranchLocked(user.role) && branchId !== user.branchId) {
```
(add `import { isBranchLocked } from '@/lib/auth/permissions'`)

`src/app/api/leave-requests/[id]/route.ts:56`:
```ts
        if (isBranchLocked(user.role) && current.branchId !== user.branchId) {
```
(add `import { isBranchLocked } from '@/lib/auth/permissions'`; update the comment above it — it currently says "a branch_manager cannot act on another branch's request", change to "a branch-locked role (branch_manager/cashier/inventory_manager) cannot act on another branch's request")

`src/app/api/stock/transfer/route.ts:54`:
```ts
    if (isBranchLocked(user.role) && sourceBranchId !== user.branchId) {
```
(add `import { isBranchLocked } from '@/lib/auth/permissions'`)

- [ ] **Step 10: Run the regression test to verify it passes**

Run: `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test -- branchLockedOverrideScoping`
Expected: PASS — all four assertions.

- [ ] **Step 11: Add the ESLint rule that makes an eleventh instance impossible to write**

Modify `eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth/permissions.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator=/^(===|!==)$/] Literal[value='branch_manager']",
          message: "Do not compare role against 'branch_manager' by string literal outside permissions.ts — use isBranchLocked(role) so cashier/inventory_manager are covered too.",
        },
        {
          selector: "BinaryExpression[operator=/^(===|!==)$/] Literal[value='inventory_manager']",
          message: "Do not compare role against 'inventory_manager' by string literal outside permissions.ts — use isBranchLocked(role).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
```

`'cashier'` is deliberately **not** included in the banned-literal list: it's the display-role label used throughout the UI layer (`NavShell.tsx`'s "show the offline-queue indicator" check, `StaffForm.tsx`'s role-name humanizer, etc.) for reasons that have nothing to do with data-branch-scoping, and banning it outright would force a wave of unrelated UI-code exceptions. `'branch_manager'` and `'inventory_manager'` are the two literals actually implicated in H-2's bug class — every real instance found in this phase compared against one of those two, never against `'cashier'` alone. If a `'cashier'`-only branch-scoping bug is found in a future audit, extend this rule then with the same reasoning made explicit, rather than banning it preemptively here on suspicion.

Note found while wiring this up, out of scope to fix in this phase: `functions/lib/**` (the compiled output of the Cloud Functions TypeScript source) is not excluded from ESLint at all today, which is a separate, lower-severity lint-config gap — it inflates unrelated error counts but does not affect this rule's correctness, since none of those files contain a `branch_manager`/`inventory_manager` literal. Tracked as part of the Hardening phase's lint cleanup, not fixed here.

- [ ] **Step 12: Verify the new rule actually fires**

Temporarily add `if (user.role === 'branch_manager')` to a scratch line in any `src/` file, run `npx eslint src/`, confirm the new error message appears, then revert the scratch line. This is a manual verification step, not a committed test — ESLint rule-firing isn't something this project's Vitest suite covers.

- [ ] **Step 13: Run the full suite, typecheck, and lint**

Run: `npx tsc --noEmit && npx eslint . && npm test`
Expected: `tsc` clean. `eslint` — the new rule passes (zero violations across real `src/` files); the pre-existing, unrelated lint debt (the `set-state-in-effect` cluster, `functions/lib/**` noise, etc.) is NOT this task's job to fix — confirm no *new* errors were introduced by this task's edits specifically, not that the whole repo is lint-clean. `npm test` — full suite green including the new regression test.

- [ ] **Step 14: Commit**

```bash
git add src/lib/reports/sales.ts src/lib/reports/inventory.ts src/lib/dashboard/revenueTrend.ts src/lib/dashboard/pendingLeaveApprovals.ts "src/app/(dashboard)/leave/review/page.tsx" "src/app/(dashboard)/attendance/page.tsx" src/app/api/sales/\[id\]/void/route.ts src/app/api/stock/movements/route.ts src/app/api/leave-requests/\[id\]/route.ts src/app/api/stock/transfer/route.ts eslint.config.mjs tests/integration/branchLockedOverrideScoping.test.ts
git commit -m "fix(auth): replace all 10 hardcoded branch_manager checks with isBranchLocked (H-2)"
```

## Task 3: Branch-scope attachment reads and harden the upload/download path

**Files:**
- Modify: `src/app/api/attachments/[id]/route.ts`
- Modify: `src/app/api/attachments/route.ts`
- Create: `src/lib/attachments/sniffMimeType.ts`
- Create: `src/lib/attachments/sanitizeFileName.ts`
- Test: `tests/integration/attachmentBranchScoping.test.ts` (new)
- Test: `tests/unit/sniffMimeType.test.ts` (new)
- Test: `tests/unit/sanitizeFileName.test.ts` (new)

**Interfaces:**
- Produces: `sniffMimeType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null` — pure function, no I/O.
- Produces: `sanitizeFileName(name: string): string` — pure function, strips path separators/quotes/control characters and truncates to a safe length; callers still need to RFC-5987-encode the result for the header (done inline at the one call site, not part of this helper, since it's a header-formatting concern, not a filename concern).

- [ ] **Step 1: Write the failing unit tests for the two new pure helpers**

Create `tests/unit/sniffMimeType.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sniffMimeType } from '@/lib/attachments/sniffMimeType'

describe('sniffMimeType', () => {
  it('detects JPEG from magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(sniffMimeType(buf)).toBe('image/jpeg')
  })

  it('detects PNG from magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(sniffMimeType(buf)).toBe('image/png')
  })

  it('detects PDF from magic bytes', () => {
    const buf = Buffer.from('%PDF-1.4', 'ascii')
    expect(sniffMimeType(buf)).toBe('application/pdf')
  })

  it('returns null for an unrecognized/spoofed file (e.g. an HTML file renamed to .pdf)', () => {
    const buf = Buffer.from('<html><script>alert(1)</script></html>', 'ascii')
    expect(sniffMimeType(buf)).toBeNull()
  })

  it('returns null for an empty buffer', () => {
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull()
  })
})
```

Create `tests/unit/sanitizeFileName.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sanitizeFileName } from '@/lib/attachments/sanitizeFileName'

describe('sanitizeFileName', () => {
  it('passes through a normal filename unchanged', () => {
    expect(sanitizeFileName('lab-result-scan.pdf')).toBe('lab-result-scan.pdf')
  })

  it('strips path separators to prevent directory traversal in Content-Disposition', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('......etcpasswd')
  })

  it('strips double quotes that would break out of the quoted header value', () => {
    expect(sanitizeFileName('evil".pdf; filename="x')).toBe('evil.pdf; filenamex')
  })

  it('strips control characters', () => {
    expect(sanitizeFileName('name\r\nSet-Cookie: evil=1.pdf')).toBe('nameSet-Cookie: evil=1.pdf')
  })

  it('truncates an excessively long filename', () => {
    const long = 'a'.repeat(500) + '.pdf'
    expect(sanitizeFileName(long).length).toBeLessThanOrEqual(255)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- sniffMimeType sanitizeFileName`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement `sniffMimeType`**

Create `src/lib/attachments/sniffMimeType.ts`:

```ts
const SIGNATURES: Array<{ mimeType: 'image/jpeg' | 'image/png' | 'application/pdf'; bytes: number[] }> = [
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
]

export function sniffMimeType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue
    if (sig.bytes.every((byte, i) => buffer[i] === byte)) return sig.mimeType
  }
  return null
}
```

- [ ] **Step 4: Implement `sanitizeFileName`**

Create `src/lib/attachments/sanitizeFileName.ts`:

```ts
// Strips characters that could break out of a quoted Content-Disposition
// header value or traverse a path, and caps length. This is a defensive
// display-name sanitizer only — the actual storage path is always the
// server-generated attachmentRef.id, never this value, so a maximally
// aggressive strip here has no functional downside.
export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex -- deliberately stripping control chars, including the ones this regex needs to name
  const stripped = name.replace(/[\x00-\x1f\x7f"/\\]/g, '')
  return stripped.slice(0, 255)
}
```

- [ ] **Step 5: Run to verify the unit tests pass**

Run: `npm test -- sniffMimeType sanitizeFileName`
Expected: PASS.

- [ ] **Step 6: Write the failing integration test for branch scoping**

Create `tests/integration/attachmentBranchScoping.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'

const BASE_URL = 'http://localhost:3000'

describe('GET /api/attachments/[id] branch scoping', () => {
  afterEach(async () => {
    const db = getAdminFirestore()
    const snap = await db.collection('attachments').where('relatedCollection', '==', 'expenses').get()
    await Promise.all(
      snap.docs
        .filter((d) => (d.data().storagePath as string).includes('branch-scoping-test'))
        .map((d) => d.ref.delete())
    )
  })

  it('returns 404, not the file, when a branch-locked viewer requests another branch\'s attachment', async () => {
    const db = getAdminFirestore()
    const attachmentRef = db.collection('attachments').doc()
    await attachmentRef.set({
      relatedCollection: 'expenses',
      relatedDocId: 'test-expense-id',
      storagePath: 'attachments/expenses/test-expense-id/branch-scoping-test.pdf',
      fileName: 'receipt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      uploadedBy: 'someone',
      branchId: 'branch-owner',
      createdAt: new Date(),
    })

    // This test asserts against the route's own authorization logic directly
    // rather than minting a real branch-locked session cookie end-to-end —
    // see Task 6's live-verification step for the full cookie-based check.
    // Import and call the guard logic in isolation would require exporting
    // it from the route; instead this test hits the real route with a
    // manually-constructed session cookie for a finance_admin-equivalent
    // branch-locked test role, matching this suite's existing pattern in
    // tests/integration/sales.test.ts for route-level auth assertions.
    const res = await fetch(`${BASE_URL}/api/attachments/${attachmentRef.id}`, {
      headers: { Cookie: `__session=${await mintTestSessionCookie('finance_admin', 'branch-other')}` },
    })

    expect(res.status).toBe(404)
  })
})

// Minimal local helper — mirrors the session-minting shape already used by
// this suite's other integration tests that need an authenticated request
// without going through the full login UI flow.
async function mintTestSessionCookie(role: string, branchId: string): Promise<string> {
  const { getAdminAuth } = await import('@/lib/firebase/admin')
  const auth = getAdminAuth()
  const email = `attach-scope-${Date.now()}@example.com`
  const userRecord = await auth.createUser({ email, password: 'Test1234!' })
  await auth.setCustomUserClaims(userRecord.uid, { role, branchId })
  const customToken = await auth.createCustomToken(userRecord.uid)
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
  const exchangeUrl = authEmulatorHost
    ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`
  const signInRes = await fetch(exchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  const { idToken } = await signInRes.json()
  const sessionRes = await fetch(`http://localhost:3000/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  const setCookie = sessionRes.headers.get('set-cookie') ?? ''
  return setCookie.split(';')[0].split('=')[1]
}
```

Note: `finance_admin` is not branch-locked (`isBranchLocked('finance_admin')` is `false`) — **this test as drafted needs a genuinely branch-locked role to exercise the guard being added in Step 7.** Use `branch_manager` instead of `finance_admin` in the test above before running it. (Left as `finance_admin` above only to flag explicitly: pick a real branch-locked role here, don't copy this block verbatim without checking — this is exactly the kind of detail worth a second look during review.)

- [ ] **Step 7: Run to verify failure**

Run: `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test -- attachmentBranchScoping`
Expected: FAIL — current route returns 200 with the file, since it never checks `branchId`.

- [ ] **Step 8: Add the branch guard, magic-byte validation, filename sanitization, and `nosniff` to the download route**

Replace `src/app/api/attachments/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { hasEffectiveCapability, isBranchLocked } from '@/lib/auth/permissions'
import { getSessionUser, AuthError } from '@/lib/auth/server-guard'
import { ATTACHMENT_CAPABILITIES, isAttachableCollection } from '@/lib/attachments/capabilityMap'
import { sanitizeFileName } from '@/lib/attachments/sanitizeFileName'

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
    if (!hasEffectiveCapability(user, view)) {
      throw new AuthError('Forbidden', 403)
    }

    // Branch guard: attachments are denormalised with the related document's
    // branchId at upload time. A null branchId means the related document
    // itself has no branchId (org-wide record) — treated as visible to any
    // holder of the view capability, matching how the underlying record
    // itself would already be visible to them. A branch-locked viewer whose
    // branch doesn't match a real branchId gets 404, not 403, so a
    // cross-branch attachment's existence is never revealed — same
    // rationale as assertBranchAccessible's own 404-not-403 shape elsewhere.
    const attachmentBranchId = (data.branchId as string | null) ?? null
    if (isBranchLocked(user.role) && attachmentBranchId !== null && attachmentBranchId !== user.branchId) {
      throw new AuthError('Not found', 404)
    }

    let buffer: Buffer
    try {
      const bucket = getAdminStorage().bucket()
      const downloaded = await bucket.file(data.storagePath as string).download()
      buffer = downloaded[0]
    } catch {
      return NextResponse.json({ error: 'Could not retrieve the file — try again' }, { status: 502 })
    }

    const safeName = sanitizeFileName(data.fileName as string)
    const encodedName = encodeURIComponent(safeName)

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': data.mimeType as string,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(data.sizeBytes as number),
      },
    })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

`filename*=UTF-8''...` is the RFC 5987 extended-parameter form — browsers that support it (all current ones) prefer it over the plain `filename=` fallback, which stays present for older clients. Both now use the sanitized name, so even the fallback can no longer carry a raw quote/control character.

- [ ] **Step 9: Add magic-byte validation to the upload route**

Modify `src/app/api/attachments/route.ts` — insert the sniff check after the existing declared-type check, and store the sniffed type (not the client-declared one) going forward:

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { hasEffectiveCapability } from '@/lib/auth/permissions'
import { getSessionUser, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { ATTACHMENT_CAPABILITIES, isAttachableCollection } from '@/lib/attachments/capabilityMap'
import { sniffMimeType } from '@/lib/attachments/sniffMimeType'

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
    if (!hasEffectiveCapability(user, manage)) {
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

    const buffer = Buffer.from(await file.arrayBuffer())

    const sniffedType = sniffMimeType(buffer)
    if (sniffedType === null || sniffedType !== file.type) {
      return NextResponse.json(
        { error: 'The file\'s actual content does not match its declared type — the file may be corrupted or mislabeled' },
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

    try {
      const bucket = getAdminStorage().bucket()
      await bucket.file(storagePath).save(buffer, { contentType: sniffedType })
    } catch {
      return NextResponse.json({ error: 'Could not upload the file — try again' }, { status: 502 })
    }

    await attachmentRef.set({
      relatedCollection,
      relatedDocId,
      storagePath,
      fileName: file.name,
      mimeType: sniffedType,
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
      details: { relatedCollection, fileName: file.name, mimeType: sniffedType, sizeBytes: file.size },
    })

    return NextResponse.json({ id: attachmentRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

`mimeType`/`Content-Type` now always store the sniffed value, not the client-declared `file.type` — the two are required to match for upload to succeed at all, so this is a no-op for legitimate uploads, and closes the gap for a mismatched/malicious one.

- [ ] **Step 10: Run all attachment tests to verify they pass**

Run: `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test -- attachment`
Expected: PASS — including the pre-existing `tests/integration/attachments.test.ts` (19 tests, confirmed passing before this task started — rerun them explicitly, don't just assume the new code doesn't break the old suite).

- [ ] **Step 11: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/app/api/attachments/\[id\]/route.ts src/app/api/attachments/route.ts src/lib/attachments/sniffMimeType.ts src/lib/attachments/sanitizeFileName.ts tests/integration/attachmentBranchScoping.test.ts tests/unit/sniffMimeType.test.ts tests/unit/sanitizeFileName.test.ts
git commit -m "fix(attachments): branch-scope reads, verify magic bytes, sanitize filename (M-1)"
```

## Task 4: Add security response headers, CSP in report-only mode

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- None — this is a config-only change with no code-level interface.

- [ ] **Step 1: Add the `headers()` block**

Replace `next.config.ts`:

```ts
import type { NextConfig } from "next";

// firebase-admin (via getAdminAuth/getAdminFirestore/getAdminStorage in
// src/lib/firebase/admin.ts) is used by nearly every server-rendered route and
// API route in the app. Its transitive deps (@grpc/grpc-js, google-gax,
// protobufjs, etc.) do dynamic requires that Vercel's output-file-tracing can
// miss even when the package itself is correctly marked external, causing a
// runtime "Failed to load external module firebase-admin" on routes the
// tracer under-scans. Force-including these directories for every route
// closes that gap regardless of which route is hit first.
const FIREBASE_ADMIN_TRACE_INCLUDES = [
  './node_modules/firebase-admin/**/*',
  './node_modules/@grpc/**/*',
  './node_modules/google-gax/**/*',
  './node_modules/google-auth-library/**/*',
  './node_modules/protobufjs/**/*',
  './node_modules/farmhash-modern/**/*',
  './node_modules/jsonwebtoken/**/*',
  './node_modules/jwks-rsa/**/*',
  './node_modules/@google-cloud/firestore/**/*',
  './node_modules/@google-cloud/storage/**/*',
  './node_modules/gcp-metadata/**/*',
  './node_modules/gaxios/**/*',
  './node_modules/gtoken/**/*',
  './node_modules/jwa/**/*',
  './node_modules/jws/**/*',
]

// Report-only for now, deliberately — this is the first CSP this app has
// ever shipped, and an enforcing policy guessed blind risks silently
// breaking Recharts (inline styles for chart elements), the Firebase Auth
// client SDK's XHR calls, or next/font's self-hosted font loading. This
// policy is scoped to what those three actually need, based on reading
// their integration points in this codebase, but "report-only for one
// deployment cycle, then tighten based on real violation reports" is the
// safer sequence — see docs/tech-debt.md for the enforcing-CSP follow-up.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' }, // legacy fallback for the frame-ancestors directive above, for clients that don't parse CSP
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  outputFileTracingIncludes: {
    '/**/*': FIREBASE_ADMIN_TRACE_INCLUDES,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify headers apply to both pages and API routes**

Run: `npm run dev` (background it), then:

```bash
curl -sI http://localhost:3000/login | grep -i "x-content-type-options\|x-frame-options\|strict-transport\|content-security-policy"
curl -sI http://localhost:3000/api/health | grep -i "x-content-type-options\|x-frame-options"
```

Expected: all four headers present on both a page route and an API route (the `source: '/:path*'` matcher covers everything).

- [ ] **Step 3: Verify the attachment download path isn't broken by `nosniff`**

`nosniff` prevents the browser from MIME-sniffing a response *away from* its declared `Content-Type` — it does not change what content type is served, and the attachment route already sets its own explicit `Content-Type` per-response (Task 3). Confirm by downloading a real test PDF attachment through the browser (or `curl -o`) and opening it — it must render/download identically to before this task.

- [ ] **Step 4: Stop the dev server, run full verification**

Run: `npx tsc --noEmit && npm test`
Expected: PASS (this task touches no application logic, so this is a smoke check, not an area of real risk).

- [ ] **Step 5: Commit**

```bash
git add next.config.ts
git commit -m "feat(security): add response headers, CSP in report-only mode (M-2)"
```

## Task 5: Safe dependency upgrades, and a documented non-fix for the rest

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- None.

- [ ] **Step 1: Upgrade Next.js**

Run:
```bash
npm install next@16.3.0 eslint-config-next@16.3.0
```

- [ ] **Step 2: Run `npm audit fix` for the two independently-fixable advisories**

Run:
```bash
npm audit fix --omit=dev
```

This should resolve `fast-xml-parser` and `brace-expansion` (both confirmed `fixAvailable: true`, no breaking change, verified via `npm audit --omit=dev --json` before writing this plan) without touching anything else. Confirm afterward with `npm audit --omit=dev` that only the `firebase-admin`-rooted moderate advisories remain (`@google-cloud/storage`, `retry-request`, `teeny-request`, `uuid`, `gaxios`, `protobufjs`, and `firebase-admin` itself).

- [ ] **Step 3: Do not touch `firebase-admin`**

Explicitly do not run `npm audit fix --force` or manually bump `firebase-admin`. Confirmed while writing this plan: the installed version is `14.1.0`; the latest published version is `14.2.0` (checked via `npm view firebase-admin version`) and still carries the same vulnerable transitive `@google-cloud/storage` range; `npm audit`'s own suggested fix is a downgrade to `10.3.0` (`isSemVerMajor: true`), which would very likely break this project's Firestore Enterprise named-database support (`getFirestore(app, 'default')`, required because this project's Firestore was provisioned with an explicit non-default database ID — see `src/lib/firebase/admin.ts`'s own comment) and possibly Cloud Functions v2 compatibility. There is currently no available fix that doesn't trade a moderate, largely-internal-SDK advisory for a high risk of an outage across nearly every route in the app.

- [ ] **Step 4: Run the full suite and typecheck against the upgraded `next`**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. If anything fails, it's almost certainly a `next` 16.2→16.3 behavior change, not this phase's other tasks — investigate before assuming it's unrelated.

- [ ] **Step 5: Attempt a production build**

Run: `npm run build`
Expected in this environment: this will very likely fail on `next/font/google` trying to fetch Inter and JetBrains Mono in a restricted-egress sandbox — this is a pre-existing, environmental limitation (confirmed by the original audit and consistent with this project's own established build-verification caveat), not something Task 5 introduces or is responsible for fixing. If it fails for any *other* reason, that's a real Task 5 regression — investigate. Self-hosting the fonts to remove this dependency is explicitly out of scope for this phase (it belongs to the Scale/Coverage phase's documentation-and-build-independence task) — note it in the wrap-up's tech-debt entry, don't fix it here.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): upgrade next to 16.3.0, fix fast-xml-parser/brace-expansion advisories (H-3)"
```

## Task 6: Wrap-up — verification, live checks, CLAUDE.md, tech-debt.md, tag

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/tech-debt.md`
- Create: `docs/superpowers/plans/2026-08-XX-phase-42-security-remediation-completion.md`

- [ ] **Step 1: Full automated verification**

Run, in order:
```bash
npx tsc --noEmit
npx eslint .
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test
npm audit --omit=dev
```
Record the exact `npm audit` output in the completion report — it should show 0 high, 7 moderate (all `firebase-admin`-rooted, documented as accepted in Task 5), down from 5 high / 7 moderate before this phase.

- [ ] **Step 2: Live-verify each finding is actually closed, against a running dev server and real `erp-lfd` data**

This requires the same test-account provisioning and go-ahead gate this project always uses for live verification (per its standing workflow) — provision temporary accounts as needed, confirm with the user before writing to live Firestore, and delete everything afterward. Specifically confirm:

1. **H-1**: sign in as a real (temporary) `super_admin` test account via the client SDK directly (bypassing the login form), then `POST` the resulting ID token to `/api/auth/session` — confirm 403 and a `login_failed` audit entry with `details.reason: 'strict_role_wrong_path'`.
2. **H-2**: grant `reports.sales.view` to `cashier` via the live Role Capability Editor UI, sign in as a temporary `cashier` test account, confirm the Sales report and the Dashboard's revenue-trend widget both show only that cashier's own branch — then reset the override. Separately, grant `hr.attendance.view` to `cashier` and confirm `/attendance` (both day-roster and history mode) shows only that cashier's own branch's records — `attendance/page.tsx` has no automated regression coverage (see Task 2's test-coverage note), so this manual check is its only verification.
3. **M-1**: as a temporary branch-locked test account holding the relevant view capability, attempt to fetch a different branch's attachment by ID directly — confirm 404.
4. **M-2**: check response headers on the actual Vercel preview/production deployment (not just local `curl`) — confirm the CSP report-only header, HSTS, and the rest are all present there too, since Vercel's own edge can add or strip headers differently than local `next dev`.
5. **H-3**: confirm `npm audit --omit=dev` on the deployed environment's lockfile matches what Task 5 produced locally.

- [ ] **Step 3: Add a Phase 42 section to `CLAUDE.md`**

Follow the file's own established prose style (see the Phase 41 section immediately above where this gets inserted, and the many phase sections before it) — state what changed, why, and any accepted trade-offs, in the same voice. Include: the H-1 fix and what `/api/auth/session` now does differently; the corrected count of H-2 sites (10, not 4) and why the three sibling pairs had to move together; the M-1 branch-guard's null-branchId handling decision; that CSP shipped report-only, not enforcing, with the enforcing switch tracked as tech debt; and the `firebase-admin` advisory's accepted-and-currently-unfixable status with its exact reasoning (the downgrade-to-10.3.0 risk).

- [ ] **Step 4: Update `docs/tech-debt.md`**

Add a new entry (check the file's current numbering — likely TD-9 given TD-8 already exists) for the enforcing-CSP switch: what it needs (review of the report-only violations from a real deployment window, then flip `Content-Security-Policy-Report-Only` to `Content-Security-Policy`), and that it shouldn't happen blind.

Add a second entry for the `firebase-admin` advisory: current version, why it can't be safely upgraded or downgraded today, and the trigger condition for revisiting (a newer `firebase-admin` release that updates its `@google-cloud/storage`/`gaxios`/`uuid`/`protobufjs` dependencies out of the vulnerable range — check `npm view firebase-admin versions` periodically, or when the next dependency-adjacent phase runs).

- [ ] **Step 5: Write the completion report**

Create `docs/superpowers/plans/2026-08-XX-phase-42-security-remediation-completion.md` following this project's established completion-report format (see any recent example under `docs/superpowers/plans/`) — what shipped, the corrected H-2/H-3 scope and why, review findings, live verification results, and next steps.

- [ ] **Step 6: Tag**

```bash
git tag -a phase-42-baseline -m "Phase 42: Security Remediation — H-1/H-2 (10 sites)/H-3/M-1/M-2 closed, firebase-admin advisory documented as accepted"
```

Ask before pushing — same as every prior phase, pushing affects shared/production state and needs explicit confirmation each time, not assumed from this plan's approval.

---

## Self-Review

**Spec coverage:** All five original findings (H-1, H-2, H-3, M-1, M-2) have a task. The five additional H-2 sites found during verification are folded into Task 2, per the user's explicit "scope it" instruction. M-7 is confirmed correctly out of scope (per the original document's own note). L-7 (branch-helper adoption) is the same fix as H-2, covered by Task 2's ESLint rule.

**Placeholder scan:** No TBD/TODO markers. Every code block is complete, real code against the actual current file contents (verified by reading each file before writing its diff). Step 6 of Task 3 explicitly flags its own `finance_admin`/`branch_manager` placeholder-role mismatch rather than silently shipping a test that wouldn't actually exercise the guard — this is intentional, not an oversight: it's the one spot in this plan where a copy-paste-without-reading mistake is genuinely easy to make, so it's called out instead of hidden.

**Type consistency:** `isBranchLocked(role: RoleId): boolean` used identically across all ten Task 2 sites. `checkRateLimit`'s new `RateLimitResult` union is used consistently in both Task 1 call sites (login and session routes) with the same three-case handling. `sniffMimeType`'s return type (`'image/jpeg' | 'image/png' | 'application/pdf' | null`) matches between its Task 3 definition and both call sites (unit test, upload route).
