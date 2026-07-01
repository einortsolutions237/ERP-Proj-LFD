# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the LFD Services ERP foundation — scaffold, branches, auth/permissions (6-role RBAC, module-scoped capabilities, 3-layer enforcement), staff CRUD, and core administration (roles view, departments, branches, settings, audit log) — on Next.js + Firebase, deployed to Vercel.

**Architecture:** Modular monolith inside one Next.js App Router app. Firebase Auth (custom claims = source of truth for role/branch) + Firestore (default-deny rules, `branchId` on every doc) + Admin SDK for all privileged writes. No test suite yet — each task ends with a manual verification recipe tied to the Phase 1 exit criteria instead of automated tests.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind CSS, Firebase Auth + Firestore + Admin SDK, Vercel deploy target, Firebase project `lfd-erp-4713b`.

## Global Constraints

(Copied verbatim from CLAUDE.md — every task below implicitly inherits these.)

- No Proxy-based Firebase SDK initialization — use direct SDK calls
- No hardcoded Firebase credentials or fallback values in client code — env vars only, no `??` fallback to literals
- Don't let tooling silently regenerate/empty `tsconfig.json` — verify it after any AI-assisted scaffold
- No `Math.random()` for temporary passwords or any security-sensitive value — use a CSPRNG
- Firestore rules default-deny; every collection needs an explicit, tested rule — no blanket permissive rules
- Session cookies: don't hardcode `secure: true` + `sameSite: none` — it silently drops cookies in non-HTTPS preview environments
- No public self-registration route — accounts are created by a permitted internal role only
- Cloud Functions v2, not v1 (not used in Phase 1, but noted for later)
- Every record in this phase carries `branchId` from creation
- Enforce role + branch checks at UI, server, and Firestore rules — all three, never just one

## Design Decisions (confirm during go-ahead review)

1. **Login is a hybrid, routed server-side by account role — confirmed by you, not a compromise I picked alone.** `super_admin` and `admin` keep the tamper-proof server-side path (Identity Toolkit REST password verification); the other four roles use the client SDK with best-effort failed-login reporting, per your instruction to reduce complexity for the common case while preserving strict audit integrity for the sensitive accounts.

   Mechanically: the login form always POSTs `{email, password}` to `POST /api/auth/login` first. That route looks up the account by email (Admin SDK `getUserByEmail`) and checks its role *before* touching the password:
   - Role is in `STRICT_AUDIT_ROLES` (`super_admin`, `admin`) → the route itself verifies the password via the Identity Toolkit REST endpoint, mints the session cookie, and writes the `login`/`login_failed` audit entry directly. The client never touches the client SDK for these accounts.
   - Role is anything else, or the account doesn't exist → the route responds `{ strategy: 'client_sdk' }` without touching the password at all, and the client falls through to `signInWithEmailAndPassword` + `POST /api/auth/session` (mint) or `POST /api/auth/login-failed` (best-effort failure report), exactly as before.

   **Flagged trade-off, now accepted per your confirmation:** this routing necessarily reveals whether a given email belongs to a `super_admin`/`admin` account, before any password is checked (unknown emails and non-strict-role emails get an identical `client_sdk` response, so this is a narrow role signal, not full account enumeration). Documented in CLAUDE.md as an accepted trade-off for an internal-only ERP.

   **Judgment call worth double-checking:** I scoped `STRICT_AUDIT_ROLES` to exactly `super_admin` and `admin`, reading "admin, sensitive actions" as "the `admin` role, plus action-level auditing" — action-level auditing (staff create/edit/delete, permission changes) was already tamper-proof regardless of login path, since those always go through Admin SDK API routes. If you meant `it_admin` or `hr_admin` should also get strict login auditing (they touch settings/audit-log and staff/roles respectively), say so and I'll widen the set.
2. **Source of truth for role/branch is Firebase custom claims** (`role`, `branchId`, `superAdmin`) exclusively — Firestore is never read to make an authorization decision, only for profile metadata. Concretely this changes one thing from the original plan: staff "active/inactive" status is no longer checked via a Firestore read at login. Instead, deactivating a staff member calls `getAdminAuth().updateUser(uid, { disabled: true })`, and Firebase Auth itself refuses sign-in (client SDK) and token verification (`verifyIdToken`/`verifySessionCookie`) for disabled users — no Firestore lookup needed anywhere in the auth path. Role changes also call `revokeRefreshTokens(uid)` so a demotion takes effect immediately instead of waiting out the old token's lifetime.
3. **No `roles` Firestore collection**, unchanged from the original plan — the role list and capability matrix are a static table in code (`lib/auth/permissions.ts`).
4. **Role list replaced (supersedes CLAUDE.md's old 14-role healthcare model):** `super_admin`, `admin`, `branch_manager`, `hr_admin`, `finance_admin`, `it_admin`. CLAUDE.md has been rewritten to match. Phase 1's exit criteria and Task 13's verification checklist below are updated accordingly (6 roles, not 14; spot-checks now cover all 6 rather than a sample).
5. **RBAC is structured per module, not just per role**, per your instruction — but Phase 1 only *builds* the admin/core-administration module (staff, roles, departments, branches, settings, audit log). POS, inventory, CRM, and accounting don't exist yet, so there's nothing to gate permissions on for them yet — building their screens now would be building ahead, which the original brief explicitly said to avoid. The resolution: `lib/auth/permissions.ts` defines a `Module` type covering all five future modules plus `admin`, and every `Capability` string is module-prefixed (e.g. `admin.staff.view`) with a `CAPABILITY_MODULE` map — so the shape future modules plug into exists now, but only the `admin` module has actual capabilities and role mappings in Phase 1. Flagged in case you wanted the other four modules stubbed out with placeholder screens too, rather than just reserved in the type system.
6. **Phase 1 admin capability matrix**, rebuilt for the 6 roles (still a default I'm choosing, not something the brief specifies beyond staff CRUD — **flagged for your review**):
   - `admin.staff.view/create/edit/delete`: super_admin, admin, hr_admin
   - `admin.roles.view/assign`: super_admin, admin, hr_admin
   - `admin.departments.manage`: super_admin, admin, branch_manager
   - `admin.branches.manage`: super_admin, admin
   - `admin.settings.manage`: super_admin, admin, it_admin
   - `admin.auditLog.view`: super_admin, admin, it_admin
   - `finance_admin` gets no Phase 1 admin capabilities — **confirmed intentional by you**, reserved for the Phase 2+ accounting module. In Phase 1 the role exists and can log in and reach the dashboard shell (login/dashboard access isn't gated by any capability — every authenticated role gets that much), but every admin API route and every nav link beyond Dashboard is inaccessible to it. Task 12's verification checklist below asserts this explicitly.
7. **Session cookie:** unchanged from the original plan — `sameSite: 'lax'`, `secure: true` whenever `VERCEL === '1'` or `NODE_ENV === 'production'`, 7-day expiry.

## Open questions (Phase 1 does not answer these — flagging per your instruction, not guessing)

- Jurisdiction/tax compliance target — affects audit retention, PII handling, and any encryption-at-rest requirements not yet designed for.
- Payment processor(s) for the future POS module, CRM data scope, inventory/accounting integration approach — all out of scope for Phase 1.
- Design Decision #6's capability matrix — `branch_manager`'s department-management scope is still a default I chose, not something you've confirmed or corrected yet.
- Design Decision #5 — confirm whether reserving the other four modules in the type system is sufficient, or whether you want placeholder screens for them now.
- Design Decision #1's `STRICT_AUDIT_ROLES` membership (`super_admin`, `admin` only) — my read of "admin, sensitive actions," flagged in case you meant to include `it_admin`/`hr_admin` too.

**Resolved this round:** the failed-login best-effort trade-off (accepted, documented in CLAUDE.md) and `finance_admin`'s empty Phase 1 permission set (confirmed intentional) are no longer open.

---

## File/Folder Structure

```
/
├── docs/superpowers/plans/2026-07-01-phase-1-foundation.md   (this file)
├── src/
│   ├── app/
│   │   ├── layout.tsx                       # root layout
│   │   ├── page.tsx                         # redirects to /login or /dashboard
│   │   ├── globals.css
│   │   ├── login/page.tsx                   # login form, posts to /api/auth/login
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                   # session-gated shell, role-aware nav
│   │   │   ├── dashboard/page.tsx           # landing page after login
│   │   │   ├── staff/
│   │   │   │   ├── page.tsx                 # list + create/edit/delete
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [staffId]/page.tsx
│   │   │   ├── roles/page.tsx               # read-only matrix + role reassignment
│   │   │   ├── departments/page.tsx
│   │   │   ├── branches/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── audit-log/page.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts           # POST: role pre-check; strict server-verified login for super_admin/admin, else routes client to the SDK path
│   │       │   ├── session/route.ts         # POST: verify client-signed-in ID token, mint session cookie, audit log
│   │       │   ├── login-failed/route.ts    # POST: best-effort client-reported failed-login audit log
│   │       │   └── logout/route.ts          # POST: clear cookie, audit log
│   │       ├── staff/route.ts               # GET (list), POST (create)
│   │       ├── staff/[staffId]/route.ts     # GET, PATCH, DELETE
│   │       ├── departments/route.ts
│   │       ├── departments/[id]/route.ts
│   │       ├── branches/route.ts
│   │       ├── branches/[id]/route.ts
│   │       ├── settings/route.ts
│   │       ├── settings/[key]/route.ts
│   │       └── audit-log/route.ts           # GET only
│   ├── components/
│   │   ├── layout/NavShell.tsx, Sidebar.tsx
│   │   ├── staff/StaffForm.tsx, StaffTable.tsx
│   │   ├── roles/RoleMatrix.tsx
│   │   ├── departments/DepartmentForm.tsx, DepartmentTable.tsx
│   │   ├── branches/BranchForm.tsx, BranchTable.tsx
│   │   ├── settings/SettingsTable.tsx
│   │   └── audit/AuditLogTable.tsx
│   ├── lib/
│   │   ├── firebase/client.ts               # client SDK init (direct calls)
│   │   ├── firebase/admin.ts                # Admin SDK init (server only)
│   │   ├── auth/permissions.ts              # ROLES, Capability, ROLE_CAPABILITIES, hasCapability
│   │   ├── auth/session.ts                  # cookie create/verify helpers
│   │   ├── auth/server-guard.ts             # getSessionUser, requireCapability, AuthError
│   │   ├── audit/log.ts                     # writeAuditLog (Admin SDK only)
│   │   ├── crypto/password.ts               # CSPRNG temp password generator
│   │   └── types/
│   │       ├── staff.ts, branch.ts, department.ts, settings.ts, audit.ts
│   └── middleware.ts                        # redirects unauthenticated requests to /login
├── scripts/seed.ts                          # seeds one branch + super_admin (Admin SDK, run via tsx, never shipped)
├── firestore.rules
├── firestore.indexes.json
├── .env.local.example                       # documents required vars, no real values
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── vercel.json                              # not usually needed for Next.js, add only if a preview issue demands it
```

## Firestore Collections

**`branches/{branchId}`**
```ts
{
  name: string
  address: string
  phone: string | null
  active: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**`staff/{uid}`** — doc ID == Firebase Auth uid, 1:1
```ts
{
  uid: string
  email: string
  name: string
  role: RoleId                 // mirrors custom claim `role`
  branchId: string              // mirrors custom claim `branchId`
  department: string | null
  contact: { phone: string | null; address: string | null }
  emergencyContact: { name: string | null; phone: string | null; relationship: string | null }
  employment: { startDate: Timestamp; status: 'active' | 'inactive' }
  qualifications: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
  createdBy: string             // uid of creator
}
```

**`departments/{departmentId}`**
```ts
{ name: string; branchId: string; active: boolean; createdAt: Timestamp; updatedAt: Timestamp }
```

**`settings/{key}`** — doc ID == the key
```ts
{ key: string; value: string | number | boolean; branchId: string | null; updatedAt: Timestamp; updatedBy: string }
```

**`auditLogs/{logId}`** — auto ID, append-only
```ts
{
  action: 'login' | 'login_failed' | 'logout' | 'staff_create' | 'staff_edit' | 'staff_delete' | 'permission_change'
  actorUid: string | null
  actorEmail: string | null
  targetUid: string | null
  branchId: string | null
  details: Record<string, unknown> | null
  createdAt: Timestamp           // server timestamp, set by Admin SDK
}
```

## Build Order

1. Scaffold (Next.js/TS/Tailwind, Firebase client+admin init, env vars, tsconfig verify)
2. Branches collection + seed script (branch + super_admin, custom claims)
3. Permissions model (static role/capability table) + server-guard helpers
4. Audit log module + Firestore rule for `auditLogs`
5. Auth (server-side login route, session cookie, middleware, logout) with login/logout/failed-login audit wiring
6. Staff management (CRUD + custom-claims sync + super_admin protections + rules)
7. Departments CRUD + rules
8. Branches CRUD UI + rules
9. Settings CRUD + rules
10. Audit log viewer (read-only)
11. Roles & permissions screen (matrix + reassignment entry point)
12. Dashboard shell + role-gated nav wiring
13. Full manual verification pass against every exit criterion

---

## Task 1: Scaffold

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `postcss.config.js`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Create: `.env.local.example`, `.gitignore` additions (`.env.local`)
- Create: `src/lib/firebase/client.ts`, `src/lib/firebase/admin.ts`

**Interfaces:**
- Produces: `getFirebaseApp()` (client), `getAdminApp()` / `getAdminAuth()` / `getAdminFirestore()` (server) — every later task's Firebase access goes through these two files, nothing else calls `initializeApp` directly.

- [ ] **Step 1: Scaffold Next.js**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir=false --import-alias "@/*" --eslint
```

- [ ] **Step 2: Verify tsconfig.json wasn't emptied**

Open `tsconfig.json` and confirm it has a non-empty `compilerOptions` block with `"strict": true`. This is a named failure mode in CLAUDE.md — don't skip this check.

- [ ] **Step 3: Install Firebase deps**

```bash
npm install firebase firebase-admin
```

- [ ] **Step 4: `.env.local.example`**

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=lfd-erp-4713b
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_ADMIN_PROJECT_ID=lfd-erp-4713b
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
SESSION_COOKIE_NAME=__session
```

No literal values committed. Copy to `.env.local` locally and fill in from the Firebase console; set the same keys in Vercel project settings (Production + Preview) later.

- [ ] **Step 5: `src/lib/firebase/client.ts`**

```ts
import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig)
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp())
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp())
}
```

No `??` fallback literals anywhere in this file — if an env var is missing, `initializeApp` throws, which is the correct failure mode (loud, not silent).

- [ ] **Step 6: `src/lib/firebase/admin.ts`**

```ts
import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp(): App {
  if (getApps().length) return getApp()
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp())
}
```

This file must never be imported from a Client Component — it uses server-only env vars (no `NEXT_PUBLIC_` prefix) and the private key would otherwise ship to the browser.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: build succeeds (no Firebase calls happen at build time since both files export lazy getters, not top-level `initializeApp()` calls).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Firebase client/admin init"
```

---

## Task 2: Branches collection + seed script

**Files:**
- Create: `src/lib/types/branch.ts`
- Create: `firestore.rules` (initial default-deny skeleton)
- Create: `scripts/seed.ts`

**Interfaces:**
- Produces: `Branch` type (used by Task 8's branch CRUD and Task 6's staff `branchId` validation).

- [ ] **Step 1: `src/lib/types/branch.ts`**

```ts
export interface Branch {
  id: string
  name: string
  address: string
  phone: string | null
  active: boolean
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 2: `firestore.rules` skeleton (default-deny)**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Deploy this immediately so there's never a window with permissive default rules:

```bash
firebase deploy --only firestore:rules --project lfd-erp-4713b
```

- [ ] **Step 3: `scripts/seed.ts`**

```ts
import { getAdminAuth, getAdminFirestore } from '../src/lib/firebase/admin'
import { randomBytes } from 'node:crypto'

async function main() {
  const db = getAdminFirestore()
  const auth = getAdminAuth()

  const branchRef = db.collection('branches').doc()
  await branchRef.set({
    name: 'LFD Services — Main Branch',
    address: 'PLACEHOLDER — update in Branch Management',
    phone: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  console.log('Seeded branch:', branchRef.id)

  const email = process.env.SEED_SUPER_ADMIN_EMAIL
  if (!email) throw new Error('Set SEED_SUPER_ADMIN_EMAIL before running seed')
  const tempPassword = randomBytes(18).toString('base64url')

  const userRecord = await auth.createUser({ email, password: tempPassword, emailVerified: false })
  await auth.setCustomUserClaims(userRecord.uid, {
    role: 'super_admin',
    branchId: branchRef.id,
    superAdmin: true,
  })
  await db.collection('staff').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    name: 'Super Admin',
    role: 'super_admin',
    branchId: branchRef.id,
    department: null,
    contact: { phone: null, address: null },
    emergencyContact: { name: null, phone: null, relationship: null },
    employment: { startDate: new Date(), status: 'active' },
    qualifications: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: userRecord.uid,
  })

  console.log('Seeded super_admin:', email)
  console.log('Temporary password (copy now, not stored anywhere):', tempPassword)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
```

`randomBytes` (CSPRNG) is used for the temp password, not `Math.random()`, per the named failure mode. Run once with `FIREBASE_ADMIN_*` env vars and `SEED_SUPER_ADMIN_EMAIL` set locally:

```bash
npx tsx scripts/seed.ts
```

- [ ] **Step 4: Manual verification**

- Firebase Console → Firestore → `branches` collection has exactly one doc with the placeholder name.
- Firebase Console → Authentication → the super_admin user exists.
- Firebase Console → Firestore → `staff/{uid}` doc exists with `role: 'super_admin'`.
- Run `firebase deploy --only firestore:rules --project lfd-erp-4713b` succeeded with no errors, and attempting any client read (e.g. from the Firebase console's Rules Playground, unauthenticated) is denied.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: seed branches collection and super_admin, default-deny rules skeleton"
```

(Do not commit `SEED_SUPER_ADMIN_EMAIL` or the printed temp password anywhere.)

---

## Task 3: Permissions model + server-guard helpers

**Files:**
- Create: `src/lib/auth/permissions.ts`
- Create: `src/lib/auth/server-guard.ts`
- Create: `src/lib/auth/session.ts`

**Interfaces:**
- Produces: `RoleId`, `ROLES`, `STRICT_AUDIT_ROLES`, `ModuleId`, `MODULES`, `Capability`, `CAPABILITY_MODULE`, `hasCapability(role, capability)`, `SessionUser`, `getSessionUser()`, `requireCapability(capability)`, `AuthError`, `verifySessionCookie(cookieValue)`, `createSessionCookie(idToken)`, session cookie config constants — every later API route and page uses these exact names.

- [ ] **Step 1: `src/lib/auth/permissions.ts`**

```ts
export const ROLES = [
  'super_admin', 'admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin',
] as const

export type RoleId = typeof ROLES[number]

// Roles whose login must go through the server-side, tamper-proof password
// verification path (Task 5's /api/auth/login) instead of the client SDK.
export const STRICT_AUDIT_ROLES: RoleId[] = ['super_admin', 'admin']

// Every future module the permission system will gate. Phase 1 only implements
// capabilities for 'admin' — the other four are reserved so the shape exists
// without building screens ahead of scope.
export const MODULES = ['admin', 'pos', 'inventory', 'crm', 'accounting', 'hr'] as const

export type ModuleId = typeof MODULES[number]

export type Capability =
  | 'admin.staff.view' | 'admin.staff.create' | 'admin.staff.edit' | 'admin.staff.delete'
  | 'admin.roles.view' | 'admin.roles.assign'
  | 'admin.departments.manage'
  | 'admin.branches.manage'
  | 'admin.settings.manage'
  | 'admin.auditLog.view'
  // pos.*, inventory.*, crm.*, accounting.*, hr.* — no capabilities defined yet;
  // add them here when each module is actually built.

export const CAPABILITY_MODULE: Record<Capability, ModuleId> = {
  'admin.staff.view': 'admin',
  'admin.staff.create': 'admin',
  'admin.staff.edit': 'admin',
  'admin.staff.delete': 'admin',
  'admin.roles.view': 'admin',
  'admin.roles.assign': 'admin',
  'admin.departments.manage': 'admin',
  'admin.branches.manage': 'admin',
  'admin.settings.manage': 'admin',
  'admin.auditLog.view': 'admin',
}

const ADMIN_HR: RoleId[] = ['super_admin', 'admin', 'hr_admin']
const ADMIN_ONLY: RoleId[] = ['super_admin', 'admin']
const ADMIN_BRANCH_MGR: RoleId[] = ['super_admin', 'admin', 'branch_manager']
const ADMIN_IT: RoleId[] = ['super_admin', 'admin', 'it_admin']

export const ROLE_CAPABILITIES: Record<Capability, RoleId[]> = {
  'admin.staff.view': ADMIN_HR,
  'admin.staff.create': ADMIN_HR,
  'admin.staff.edit': ADMIN_HR,
  'admin.staff.delete': ADMIN_HR,
  'admin.roles.view': ADMIN_HR,
  'admin.roles.assign': ADMIN_HR,
  'admin.departments.manage': ADMIN_BRANCH_MGR,
  'admin.branches.manage': ADMIN_ONLY,
  'admin.settings.manage': ADMIN_IT,
  'admin.auditLog.view': ADMIN_IT,
}

export function hasCapability(role: RoleId, capability: Capability): boolean {
  return ROLE_CAPABILITIES[capability].includes(role)
}

export function isSuperAdmin(role: RoleId): boolean {
  return role === 'super_admin'
}
```

`finance_admin` intentionally has zero entries across `ROLE_CAPABILITIES` — it's reserved for the future accounting module (Design Decision #6).

- [ ] **Step 2: `src/lib/auth/session.ts`**

```ts
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

export function isSecureEnvironment(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isSecureEnvironment(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
```

This is the exact fix for the named cookie failure mode: `sameSite: 'lax'` avoids ever needing `'none'`, and `secure` is computed, never hardcoded `true`. Both Vercel preview and production set `VERCEL=1`, so both get `secure: true`; local `next dev` (plain HTTP) gets `secure: false` so the cookie isn't silently dropped.

- [ ] **Step 3: `src/lib/auth/server-guard.ts`**

```ts
import { cookies } from 'next/headers'
import { getAdminAuth } from '@/lib/firebase/admin'
import { SESSION_COOKIE_NAME } from './session'
import { hasCapability, type Capability, type RoleId } from './permissions'

export interface SessionUser {
  uid: string
  email: string
  role: RoleId
  branchId: string
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionCookie) return null

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true)
    if (!decoded.role || !decoded.branchId) return null
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      role: decoded.role as RoleId,
      branchId: decoded.branchId as string,
    }
  } catch {
    return null
  }
}

export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!hasCapability(user.role, capability)) throw new AuthError('Forbidden', 403)
  return user
}
```

Every API route in Tasks 6–10 starts with `const user = await requireCapability('...')` inside a try/catch that maps `AuthError.status` to the HTTP response — this is the server-layer enforcement.

- [ ] **Step 4: Manual verification**

Run: `npm run build`
Expected: compiles clean, no circular imports between `permissions.ts` / `session.ts` / `server-guard.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: static role/capability model and server-side auth guard"
```

---

## Task 4: Audit log module + Firestore rule

**Files:**
- Create: `src/lib/types/audit.ts`
- Create: `src/lib/audit/log.ts`
- Modify: `firestore.rules` (add `auditLogs` block)

**Interfaces:**
- Produces: `AuditAction`, `writeAuditLog(input)` — Task 5 (login/logout) and Task 6 (staff CRUD) both call this and only this to write logs.

- [ ] **Step 1: `src/lib/types/audit.ts`**

```ts
export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'staff_create' | 'staff_edit' | 'staff_delete'
  | 'permission_change'

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

- [ ] **Step 2: `src/lib/audit/log.ts`**

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { AuditAction } from '@/lib/types/audit'

export interface WriteAuditLogInput {
  action: AuditAction
  actorUid: string | null
  actorEmail: string | null
  targetUid?: string | null
  branchId?: string | null
  details?: Record<string, unknown> | null
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const db = getAdminFirestore()
  await db.collection('auditLogs').add({
    action: input.action,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    targetUid: input.targetUid ?? null,
    branchId: input.branchId ?? null,
    details: input.details ?? null,
    createdAt: new Date(),
  })
}
```

This file imports `firebase/admin`, so it can only run in server code (API routes) — that alone is what makes the log "server-side writes only" in practice, and Step 3's rule makes it true even if someone tried to write from the client SDK directly.

- [ ] **Step 3: Add `auditLogs` rule** (append inside `match /databases/{database}/documents { ... }` in `firestore.rules`, before the catch-all deny)

```
match /auditLogs/{logId} {
  allow read: if request.auth != null
    && request.auth.token.role in ['super_admin', 'admin', 'it_admin'];
  allow write: if false; // Admin SDK bypasses rules entirely; no client path, ever
}
```

Deploy: `firebase deploy --only firestore:rules --project lfd-erp-4713b`

- [ ] **Step 4: Manual verification**

In the Firebase Console Rules Playground, simulate:
- An authenticated write to `auditLogs/test` as any role → **denied**.
- An authenticated read as `role: 'admin'` → **allowed**.
- An authenticated read as `role: 'branch_manager'` → **denied**.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: server-only audit log writer and default-deny auditLogs rule"
```

---

## Task 5: Auth — client SDK login, session cookie minting, middleware, logout

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/session/route.ts`
- Create: `src/app/api/auth/login-failed/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `sessionCookieOptions()`, `SESSION_COOKIE_NAME`, `STRICT_AUDIT_ROLES` (Task 3), `writeAuditLog()` (Task 4), `getAdminAuth()` (Task 1), `getFirebaseAuth()` (Task 1).
- Produces: working `/login` page and `/api/auth/login`, `/api/auth/session`, `/api/auth/login-failed`, `/api/auth/logout` routes that every dashboard page (Task 12) assumes exist.

Per Design Decision #1: `super_admin`/`admin` get server-verified, tamper-proof login; the other four roles sign in via the client SDK with best-effort failed-login reporting. `/api/auth/login` is the router that decides which applies, before any password is checked.

- [ ] **Step 1: `src/app/api/auth/login/route.ts`** — role pre-check + strict server-side login for `STRICT_AUDIT_ROLES`

```ts
import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { sessionCookieOptions, SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'
import { STRICT_AUDIT_ROLES, type RoleId } from '@/lib/auth/permissions'

const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'

export async function POST(request: Request) {
  const { email, password } = await request.json()
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const auth = getAdminAuth()
  let userRecord
  try {
    userRecord = await auth.getUserByEmail(email)
  } catch {
    // Unknown account — don't reveal that. Let the client proceed with its own sign-in attempt.
    return NextResponse.json({ strategy: 'client_sdk' })
  }

  const role = userRecord.customClaims?.role as RoleId | undefined
  const branchId = userRecord.customClaims?.branchId as string | undefined

  if (!role || !STRICT_AUDIT_ROLES.includes(role)) {
    // Not a strict-audit role — identical response shape whether the account exists or not.
    return NextResponse.json({ strategy: 'client_sdk' })
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const signInRes = await fetch(`${IDENTITY_TOOLKIT_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })

  if (!signInRes.ok) {
    await writeAuditLog({ action: 'login_failed', actorUid: userRecord.uid, actorEmail: email, details: { source: 'server_verified', role } })
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  if (!branchId) {
    await writeAuditLog({ action: 'login_failed', actorUid: userRecord.uid, actorEmail: email, details: { source: 'server_verified', reason: 'no_claims' } })
    return NextResponse.json({ error: 'Account not fully provisioned' }, { status: 403 })
  }

  const { idToken } = await signInRes.json()
  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 })
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, sessionCookie, sessionCookieOptions())

  await writeAuditLog({ action: 'login', actorUid: userRecord.uid, actorEmail: email, branchId, details: { source: 'server_verified', role } })
  return response
}
```

- [ ] **Step 2: `src/app/api/auth/session/route.ts`** — mints the session cookie from an already-verified client sign-in (the `client_sdk` path from Step 1)

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

`verifyIdToken(idToken, true)` — the second argument checks revocation, so a user deactivated mid-session (Task 6's `revokeRefreshTokens` call) can't mint a fresh session cookie even if they still hold a recent ID token. No Firestore read anywhere in this route, per Design Decision #2 — disabled-user rejection happens inside `verifyIdToken` itself once Task 6 wires `updateUser(uid, { disabled: true })`.

- [ ] **Step 3: `src/app/api/auth/login-failed/route.ts`** — best-effort client-reported failure logging

```ts
import { NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/audit/log'

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({ email: null }))
  await writeAuditLog({
    action: 'login_failed',
    actorUid: null,
    actorEmail: typeof email === 'string' ? email : null,
    details: { source: 'client_reported' },
  })
  return NextResponse.json({ ok: true })
}
```

`details.source: 'client_reported'` marks these entries as distinct from anything a future server-verified flow might add — the audit log viewer (Task 10) surfaces `details` as-is, so this distinction is visible to whoever reviews the log, not just documented here. No auth guard on this route — it has to be callable pre-login, which is exactly what makes it best-effort rather than tamper-proof (see Design Decision #1).

- [ ] **Step 4: `src/app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/server-guard'
import { sessionCookieOptions } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'

export async function POST() {
  const user = await getSessionUser()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(sessionCookieOptions().name, '', { ...sessionCookieOptions(), maxAge: 0 })
  if (user) {
    await writeAuditLog({ action: 'logout', actorUid: user.uid, actorEmail: user.email, branchId: user.branchId })
  }
  return response
}
```

- [ ] **Step 5: `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'

const PUBLIC_PATHS = ['/login', '/api/auth/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/_next')) {
    return NextResponse.next()
  }
  const hasCookie = request.cookies.has(SESSION_COOKIE_NAME)
  if (!hasCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

This only checks cookie *presence* (middleware runs on the Edge runtime, which can't use `firebase-admin`) — actual verification happens in `getSessionUser()` server-side on every page/route that needs it. That's the second enforcement layer; the Firestore rules in later tasks are the third.

- [ ] **Step 6: `src/app/login/page.tsx`** (Client Component)

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Always try the router first — it decides server-verified vs. client SDK
    // based on the account's role, per Design Decision #1.
    const routeRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const routeBody = await routeRes.json()

    if (routeRes.ok && routeBody.ok) {
      router.push('/dashboard') // strict path: session already minted
      return
    }
    if (!routeRes.ok) {
      setError(routeBody.error ?? 'Login failed') // strict path: verified and rejected
      return
    }
    // routeBody.strategy === 'client_sdk' — fall through to client-side sign-in

    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
      const idToken = await credential.user.getIdToken()

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Login failed')
        return
      }
      router.push('/dashboard')
    } catch {
      // Firebase Auth rejected the credentials (wrong password, disabled user, etc.) —
      // report it for the audit log, but this is best-effort: see Design Decision #1.
      fetch('/api/auth/login-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {})
      setError('Invalid credentials')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-24 space-y-4">
      <h1 className="text-xl font-semibold">LFD Services — Sign in</h1>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded px-3 py-2" />
      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full border rounded px-3 py-2" />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" className="w-full bg-black text-white rounded px-3 py-2">Sign in</button>
    </form>
  )
}
```

Note there is deliberately no "Register" link or route anywhere in this app — satisfies "no public self-registration route."

- [ ] **Step 7: Manual verification**

- `npm run dev`, visit `/dashboard` while logged out → redirected to `/login` (middleware working).
- Log in with the seeded super_admin credentials (a `STRICT_AUDIT_ROLES` account) → `curl -v` or DevTools Network tab confirms `/api/auth/login` returned `{ok: true}` directly and `/api/auth/session` was **not** called — the strict path handled everything. A `login` audit entry appears with `details.source: 'server_verified'` and a real `actorUid`.
- Log in as the super_admin with a **wrong password** → `/api/auth/login` returns 401 itself (not a client SDK error). A `login_failed` audit entry appears with `details.source: 'server_verified'`, `actorUid` populated (we knew exactly who attempted, per the tamper-proof guarantee) — this is the concrete proof that strict-role failures are no longer best-effort.
- Log in as a non-strict role (e.g. `it_admin`) with correct credentials → `/api/auth/login` returns `{strategy: 'client_sdk'}`, then `signInWithEmailAndPassword` + `/api/auth/session` complete the flow. `login` audit entry appears with `details.source` **absent** (only strict-path entries set it) — confirms this account used the non-strict path.
- Log in as that same `it_admin` with a wrong password → Firebase Auth rejects it client-side, `login_failed` fires via the best-effort `/api/auth/login-failed` report with `details.source: 'client_reported'`.
- Submit a nonexistent email through the login form → `/api/auth/login` returns `{strategy: 'client_sdk'}` (identical shape to a real non-strict account), confirming no account-existence signal leaks; the subsequent client SDK attempt fails normally.
- Call `POST /api/auth/logout` → cookie cleared (check DevTools → Application → Cookies), `logout` audit entry appears.
- Deploy to a Vercel preview (`vercel` CLI or push a PR), repeat both the strict-path and client-SDK-path login tests there — confirm the session cookie is set and survives a page reload for both. This directly covers the "session survives a Vercel preview deploy" exit criterion.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: hybrid login — server-verified for super_admin/admin, client SDK + best-effort audit for the rest"
```

---

## Task 6: Staff management

**Files:**
- Create: `src/lib/types/staff.ts`
- Create: `src/app/api/staff/route.ts`
- Create: `src/app/api/staff/[staffId]/route.ts`
- Create: `src/app/(dashboard)/staff/page.tsx`, `new/page.tsx`, `[staffId]/page.tsx`
- Create: `src/components/staff/StaffForm.tsx`, `src/components/staff/StaffTable.tsx`
- Modify: `firestore.rules` (add `staff` block)

**Interfaces:**
- Consumes: `requireCapability` (Task 3), `writeAuditLog` (Task 4), `Branch` (Task 2).
- Produces: `Staff` type — consumed by Task 11's role-reassignment screen.

- [ ] **Step 1: `src/lib/types/staff.ts`**

```ts
import type { RoleId } from '@/lib/auth/permissions'

export interface Staff {
  uid: string
  email: string
  name: string
  role: RoleId
  branchId: string
  department: string | null
  contact: { phone: string | null; address: string | null }
  emergencyContact: { name: string | null; phone: string | null; relationship: string | null }
  employment: { startDate: string; status: 'active' | 'inactive' }
  qualifications: string[]
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
  createdBy: string
}
```

- [ ] **Step 2: `src/app/api/staff/route.ts`** (list + create)

```ts
import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { randomBytes } from 'node:crypto'
import { ROLES } from '@/lib/auth/permissions'

export async function GET() {
  try {
    const user = await requireCapability('admin.staff.view')
    const snap = await getAdminFirestore().collection('staff').where('branchId', '==', user.branchId).get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('admin.staff.create')
    const body = await request.json()

    if (body.role === 'super_admin') {
      return NextResponse.json({ error: 'super_admin cannot be assigned through this endpoint' }, { status: 403 })
    }
    if (!ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const auth = getAdminAuth()
    const tempPassword = randomBytes(18).toString('base64url')
    const userRecord = await auth.createUser({ email: body.email, password: tempPassword, emailVerified: false })
    await auth.setCustomUserClaims(userRecord.uid, { role: body.role, branchId: user.branchId, superAdmin: false })

    const staffData = {
      uid: userRecord.uid,
      email: body.email,
      name: body.name,
      role: body.role,
      branchId: user.branchId,
      department: body.department ?? null,
      contact: body.contact ?? { phone: null, address: null },
      emergencyContact: body.emergencyContact ?? { name: null, phone: null, relationship: null },
      employment: { startDate: new Date(body.startDate ?? Date.now()), status: 'active' },
      qualifications: body.qualifications ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user.uid,
    }
    await getAdminFirestore().collection('staff').doc(userRecord.uid).set(staffData)
    await writeAuditLog({ action: 'staff_create', actorUid: user.uid, actorEmail: user.email, targetUid: userRecord.uid, branchId: user.branchId })

    return NextResponse.json({ uid: userRecord.uid, tempPassword }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 3: `src/app/api/staff/[staffId]/route.ts`** (get/edit/delete, with super_admin protection)

```ts
import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'

export async function PATCH(request: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params
  try {
    const user = await requireCapability('admin.staff.edit')
    const db = getAdminFirestore()
    const docRef = db.collection('staff').doc(staffId)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    const body = await request.json()

    if (existing.role === 'super_admin') {
      const attemptsRoleChange = 'role' in body && body.role !== 'super_admin'
      const attemptsDeactivate = body.employment?.status === 'inactive'
      if (attemptsRoleChange || attemptsDeactivate) {
        return NextResponse.json({ error: 'super_admin role/status cannot be modified' }, { status: 403 })
      }
    }
    if (body.role === 'super_admin' && existing.role !== 'super_admin') {
      return NextResponse.json({ error: 'super_admin cannot be assigned through this endpoint' }, { status: 403 })
    }

    const updates = { ...body, updatedAt: new Date() }
    await docRef.update(updates)

    const auth = getAdminAuth()
    const roleChanged = body.role && body.role !== existing.role
    const statusChangedToInactive = body.employment?.status === 'inactive' && existing.employment?.status !== 'inactive'
    const statusChangedToActive = body.employment?.status === 'active' && existing.employment?.status !== 'active'

    if (roleChanged) {
      await auth.setCustomUserClaims(staffId, { role: body.role, branchId: existing.branchId, superAdmin: false })
      await writeAuditLog({ action: 'permission_change', actorUid: user.uid, actorEmail: user.email, targetUid: staffId, branchId: existing.branchId, details: { from: existing.role, to: body.role } })
    }
    if (statusChangedToInactive) {
      // Firebase Auth is the enforcement point for deactivation (Design Decision #2) —
      // no Firestore read is needed at login time, verifyIdToken/verifySessionCookie
      // reject disabled users automatically.
      await auth.updateUser(staffId, { disabled: true })
    }
    if (statusChangedToActive) {
      await auth.updateUser(staffId, { disabled: false })
    }
    if (roleChanged || statusChangedToInactive) {
      // Forces immediate re-authentication instead of waiting out the old token's lifetime.
      await auth.revokeRefreshTokens(staffId)
    }

    await writeAuditLog({ action: 'staff_edit', actorUid: user.uid, actorEmail: user.email, targetUid: staffId, branchId: existing.branchId })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params
  try {
    const user = await requireCapability('admin.staff.delete')
    const db = getAdminFirestore()
    const docRef = db.collection('staff').doc(staffId)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    if (existing.role === 'super_admin') {
      return NextResponse.json({ error: 'super_admin cannot be deleted' }, { status: 403 })
    }

    await docRef.delete()
    await getAdminAuth().deleteUser(staffId)
    await writeAuditLog({ action: 'staff_delete', actorUid: user.uid, actorEmail: user.email, targetUid: staffId, branchId: existing.branchId })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 4: `firestore.rules` — `staff` block** (append before catch-all)

```
match /staff/{staffId} {
  allow read: if request.auth != null
    && request.auth.token.branchId == resource.data.branchId
    && request.auth.token.role in ['super_admin', 'admin', 'hr_admin'];
  allow create, update, delete: if false; // all writes go through Admin SDK via /api/staff
}
```

Deploy: `firebase deploy --only firestore:rules --project lfd-erp-4713b`

This is the concrete "Firestore rules reject a direct client write" exit criterion: even a signed-in admin's browser console calling `setDoc(doc(db, 'staff', uid), {...})` directly is denied, because *every* client write is `false` — the only path is the server API, which contains the super_admin checks from Step 3.

- [ ] **Step 5: Staff pages** (`src/app/(dashboard)/staff/page.tsx`, `new/page.tsx`, `[staffId]/page.tsx`, plus `StaffForm.tsx`/`StaffTable.tsx`)

Server Components that call `requireCapability('admin.staff.view'/'admin.staff.create'/'admin.staff.edit')` before rendering (redirect to `/dashboard` with a "not authorized" message on `AuthError`), and Client Component forms (`StaffForm`) that `fetch()` the API routes above. The role `<select>` in `StaffForm` is built from `ROLES.filter((r) => r !== 'super_admin')` — `super_admin` is structurally unselectable in the UI, not just server-rejected. This is the UI-layer half of the "isn't selectable when creating other staff accounts" requirement; Steps 2–3 are the server-layer half.

- [ ] **Step 6: Manual verification**

- As super_admin, create an `it_admin` via the UI → staff doc + Auth user + custom claims all created, `staff_create` audit entry logged.
- Confirm the role dropdown in the create form has no `super_admin` option.
- `curl -X POST /api/staff -H "Cookie: __session=<it_admin's cookie>" -d '{"role":"admin",...}'` → 403 (`it_admin` lacks `admin.staff.create`, capability check working).
- `curl -X PATCH /api/staff/<super_admin_uid> -H "Cookie: __session=<admin's cookie>" -d '{"role":"admin"}'` → 403 (super_admin protection, server-side bypass attempt).
- From the browser console while signed in as admin: `setDoc(doc(db,'staff','<any-uid>'), {role:'admin'})` → denied by Firestore rules (direct client bypass attempt). This is the second half of the "reject a direct client write" exit criterion.
- Deactivate a staff member (`employment.status: 'inactive'`) via the UI → `updateUser(uid, {disabled: true})` fires. Attempt to log in as them → Firebase Auth client SDK itself throws `auth/user-disabled`, `login-failed` best-effort report fires, no session is created.
- Change a signed-in staff member's role while they hold an active session, then have them make an API call without refreshing their token → `verifySessionCookie`'s revocation check (from `revokeRefreshTokens`) rejects the stale session, forcing re-login with fresh claims.
- Delete a non-super_admin staff member → succeeds, `staff_delete` logged; attempt to delete the super_admin → 403.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: staff CRUD with custom-claims sync, super_admin protection at UI/server/rules, audit logging"
```

---

## Task 7: Departments CRUD + rules

**Files:**
- Create: `src/lib/types/department.ts`
- Create: `src/app/api/departments/route.ts`, `src/app/api/departments/[id]/route.ts`
- Create: `src/app/(dashboard)/departments/page.tsx`, `src/components/departments/DepartmentForm.tsx`, `DepartmentTable.tsx`
- Modify: `firestore.rules` (add `departments` block)

**Interfaces:**
- Consumes: `requireCapability('admin.departments.manage')`, `writeAuditLog` is **not** called here — the audit scope in CLAUDE.md/spec covers login/logout/failed-login and staff/permission changes only, not department CRUD. Flagging that department edits are currently unaudited; say the word if you want that expanded.

This follows the exact same request/response and rule pattern as Task 6's staff routes, sized down to the simpler shape (no Auth user, no custom claims, no super_admin case):

- [ ] **Step 1: `src/lib/types/department.ts`**

```ts
export interface Department {
  id: string
  name: string
  branchId: string
  active: boolean
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 2: API routes** — `GET`/`POST` on `route.ts`, `PATCH`/`DELETE` on `[id]/route.ts`, each starting with `await requireCapability('admin.departments.manage')`, scoping `GET` to `where('branchId', '==', user.branchId)`, and validating `name` is a non-empty string on create/edit. No custom claims, no Auth user creation — just a Firestore doc with `branchId`, `active`, timestamps.

- [ ] **Step 3: `firestore.rules` — `departments` block**

```
match /departments/{departmentId} {
  allow read: if request.auth != null
    && request.auth.token.branchId == resource.data.branchId;
  allow write: if false;
}
```

Deploy: `firebase deploy --only firestore:rules --project lfd-erp-4713b`

- [ ] **Step 4: Page + components** — list/create/edit/deactivate UI, same shape as `StaffTable`/`StaffForm` but for the 2-field department object.

- [ ] **Step 5: Manual verification**

- Create/edit/deactivate a department as admin → succeeds, shows up scoped to the seeded branch.
- Create/edit as `branch_manager` → succeeds (has `admin.departments.manage`).
- Attempt as an `hr_admin` session → 403 from the API, and the nav link doesn't even render for that role (Task 12 wires nav visibility from `hasCapability`).
- Direct client `setDoc` attempt on `departments/{id}` → denied by rules.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: department CRUD scoped to branch, default-deny rules"
```

---

## Task 8: Branches CRUD UI + rules

**Files:**
- Create: `src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`
- Create: `src/app/(dashboard)/branches/page.tsx`, `src/components/branches/BranchForm.tsx`, `BranchTable.tsx`
- Modify: `firestore.rules` (add `branches` block)

**Interfaces:**
- Consumes: `Branch` type (Task 2), `requireCapability('admin.branches.manage')`.

Same pattern as Task 7, applied to the `branches` collection already seeded in Task 2 — this task adds the CRUD API/UI around that existing collection, it doesn't create it.

- [ ] **Step 1: API routes** — `GET`/`POST`/`PATCH`/`DELETE`, gated by `requireCapability('admin.branches.manage')`. `GET` is **not** branch-filtered (branch admins need to see all branches to manage them) — return the full collection.

- [ ] **Step 2: `firestore.rules` — `branches` block**

```
match /branches/{branchId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

Deploy: `firebase deploy --only firestore:rules --project lfd-erp-4713b`

- [ ] **Step 3: Page + components** — list showing the one seeded branch, edit form to replace the placeholder name/address, create form for future branches (even though only one exists today, per spec: "build the CRUD even with just one branch").

- [ ] **Step 4: Manual verification**

- Edit the seeded branch's placeholder name/address via the UI → persists.
- Create a second branch, confirm it appears in the list with no other side effects (no staff auto-assigned to it).
- Non-admin role hitting `/api/branches` PATCH → 403.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: branch management CRUD UI"
```

---

## Task 9: Settings CRUD + rules

**Files:**
- Create: `src/lib/types/settings.ts`
- Create: `src/app/api/settings/route.ts`, `src/app/api/settings/[key]/route.ts`
- Create: `src/app/(dashboard)/settings/page.tsx`, `src/components/settings/SettingsTable.tsx`
- Modify: `firestore.rules` (add `settings` block)

**Interfaces:**
- Consumes: `requireCapability('admin.settings.manage')`.

- [ ] **Step 1: `src/lib/types/settings.ts`**

```ts
export interface SystemSetting {
  key: string
  value: string | number | boolean
  branchId: string | null
  updatedAt: FirebaseFirestore.Timestamp
  updatedBy: string
}
```

- [ ] **Step 2: API routes** — `GET` lists all settings; `POST`/`PATCH` upsert by key (doc ID = key), validating `key` matches `/^[a-z0-9_.]+$/` to keep it a real key-value store, not free text; `DELETE` removes a key. All gated by `requireCapability('admin.settings.manage')`.

- [ ] **Step 3: `firestore.rules` — `settings` block**

```
match /settings/{key} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

Deploy: `firebase deploy --only firestore:rules --project lfd-erp-4713b`

- [ ] **Step 4: Page + components** — simple key/value table with add/edit/delete row, no categorization (Phase 1 scope is "basic system settings").

- [ ] **Step 5: Manual verification**

- Add a setting (e.g. `business.timezone` = `Africa/Lagos`) as admin → persists, readable by any signed-in role, editable only by admin/super_admin/it_admin.
- Attempt edit as `finance_admin` → 403 (lacks `admin.settings.manage`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: key-value system settings CRUD"
```

---

## Task 10: Audit log viewer

**Files:**
- Create: `src/app/(dashboard)/audit-log/page.tsx`
- Create: `src/components/audit/AuditLogTable.tsx`
- Modify: `src/app/api/audit-log/route.ts` (GET only — the collection and its rules already exist from Task 4)

**Interfaces:**
- Consumes: `AuditLogEntry` (Task 4), `requireCapability('admin.auditLog.view')`.

- [ ] **Step 1: `src/app/api/audit-log/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'

export async function GET() {
  try {
    await requireCapability('admin.auditLog.view')
    const snap = await getAdminFirestore().collection('auditLogs').orderBy('createdAt', 'desc').limit(200).get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

No `PATCH`/`DELETE` handler exists on this route at all — not "returns 403," just structurally absent, matching "never expose an edit or delete path for audit entries."

- [ ] **Step 2: Page + `AuditLogTable`** — read-only table, columns: timestamp, action, actor email, target uid, branch. No row actions.

- [ ] **Step 3: Manual verification**

- As admin, view the log after the Task 5/6 verification steps → every login, login_failed, logout, staff_create, staff_edit, staff_delete, and permission_change from earlier testing appears, with client-reported `login_failed` entries showing `details.source: 'client_reported'`.
- Confirm there is no edit/delete UI anywhere on this page, and `curl -X DELETE /api/audit-log/<id>` → 404 (route doesn't exist, method not allowed).
- As `branch_manager`, visit `/audit-log` → redirected/forbidden (lacks `admin.auditLog.view`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: read-only audit log viewer"
```

---

## Task 11: Roles & permissions screen

**Files:**
- Create: `src/app/(dashboard)/roles/page.tsx`
- Create: `src/components/roles/RoleMatrix.tsx`

**Interfaces:**
- Consumes: `ROLES`, `ROLE_CAPABILITIES` (Task 3, static — no new API route needed for the matrix itself), `Staff` (Task 6), reuses `PATCH /api/staff/[staffId]` for reassignment.

- [ ] **Step 1: `RoleMatrix`** — renders the static `ROLE_CAPABILITIES` table read-only (role rows × capability columns, checkmarks). `super_admin` row is rendered but every cell is annotated "(full access, protected)" rather than computed from the capability list, making clear in the UI itself that this role is out-of-band.

- [ ] **Step 2: Reassignment list** — reuses `StaffTable` filtered/sorted by role, each non-super_admin row has a role `<select>` (same `ROLES.filter(r => r !== 'super_admin')` list as `StaffForm`) that calls `PATCH /api/staff/[staffId]` with the new role. Super_admin's row renders the role as plain text, no `<select>`, no edit affordance at all — the third UI-layer confirmation of the protection (alongside Task 6 Step 6's create-form exclusion and Task 6 Step 3's server-side rejection).

- [ ] **Step 3: Manual verification**

- As admin, view `/roles` → matrix renders all 6 roles, super_admin visually distinct with no reassignment control.
- Reassign a `branch_manager` to `hr_admin` → `staff.role` updates, custom claims update, active sessions for that user get revoked (per Task 6 Step 3), `permission_change` audit entry logged (this reuses Task 6 Step 3's existing logic, so this is confirming wiring, not new logic).
- Attempt to reassign super_admin via crafted `PATCH` request (bypassing the missing UI control) → 403, per Task 6 Step 3's existing guard.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: roles and permissions view with protected super_admin reassignment"
```

---

## Task 12: Dashboard shell + role-gated nav

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/components/layout/NavShell.tsx`, `Sidebar.tsx`
- Modify: `src/app/page.tsx` (redirect root based on session)

**Interfaces:**
- Consumes: `getSessionUser()` (Task 3), `hasCapability()` (Task 3).

- [ ] **Step 1: `src/app/(dashboard)/layout.tsx`** — Server Component, calls `getSessionUser()`; redirects to `/login` if null (belt-and-suspenders alongside middleware — this is the actual data-bearing check, middleware only checked cookie presence). Passes the resolved `user` into `NavShell`.

- [ ] **Step 2: `Sidebar`** — renders a link per section only if `hasCapability(user.role, <relevant capability>)` is true: Staff (`admin.staff.view`), Roles (`admin.roles.view`), Departments (`admin.departments.manage`), Branches (`admin.branches.manage`), Settings (`admin.settings.manage`), Audit Log (`admin.auditLog.view`). This is the UI-layer enforcement referenced throughout — a role without a capability never sees the link, on top of the API route rejecting the request if reached directly.

- [ ] **Step 3: `src/app/(dashboard)/dashboard/page.tsx`** — minimal landing page: welcome message with the user's name/role/branch, no capability-gated content of its own.

- [ ] **Step 4: `src/app/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/server-guard'

export default async function RootPage() {
  const user = await getSessionUser()
  redirect(user ? '/dashboard' : '/login')
}
```

- [ ] **Step 5: Manual verification** — with only 6 roles total, check all of them rather than sampling, per Design Decision #4/#6:

- Log in as `finance_admin` → sidebar is empty apart from Dashboard (no Phase 1 admin capabilities — reserved for the future accounting module; flag to the user if that feels wrong).
- Log in as `branch_manager` → sidebar shows Departments only.
- Log in as `hr_admin` → sidebar shows Staff and Roles only.
- Log in as `it_admin` → sidebar shows Settings and Audit Log only.
- Log in as `admin` → sidebar shows everything except nothing is withheld — Staff, Roles, Departments, Branches, Settings, Audit Log all appear.
- Log in as `super_admin` → sidebar shows everything, plus super_admin's own row is protected everywhere it appears.
- This step is the updated manual check for the "spot-check at least [representative roles], admin, and super_admin" exit criterion — expanded from the original 4-of-14 sample to all 6 roles, since the role set shrank.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: dashboard shell with role-gated navigation"
```

---

## Task 13: Full exit-criteria verification pass

No new files — this is a checklist run against the finished app, ideally on a Vercel preview deploy so the session-cookie criterion is tested for real.

- [ ] **Step 1:** All 6 roles exist in `ROLES` and are assignable via `/staff/new` and `/roles` (except super_admin, confirmed unselectable in both places).
- [ ] **Step 2:** Super_admin protection holds under a UI attempt (no controls exist) and a direct API/curl attempt (`PATCH`/`DELETE` on the super_admin uid → 403 in both cases, per Task 6).
- [ ] **Step 3:** Spot-check login as all 6 roles (branch_manager, hr_admin, finance_admin, it_admin, admin, super_admin) — each sees only their capability-gated nav and each blocked API route returns 403 when called directly for a capability they lack.
- [ ] **Step 4:** From an authenticated browser console, attempt a direct Firestore write to `staff`, `departments`, `branches`, `settings`, and `auditLogs` — all five are denied by rules (`allow write: if false` in every case except server paths, which don't go through client SDK rules at all).
- [ ] **Step 5:** `grep -rn "AIza\|apiKey.*=.*['\"]" src/` (or equivalent) turns up no literal Firebase config values, only `process.env.*` references; confirm `.env.local` is in `.gitignore` and was never committed (`git log --all --full-history -- .env.local` is empty).
- [ ] **Step 6:** Deploy a Vercel preview, log in there, refresh the page, close and reopen the tab within the 7-day window → still authenticated. This is the literal "session survives a Vercel preview deploy" check, not a localhost stand-in for it.
- [ ] **Step 7:** Re-run the full login/logout/failed-login/staff-create/staff-edit/staff-delete/permission-change sequence once end-to-end — for login and failed-login, cover **both** a `STRICT_AUDIT_ROLES` account (server-verified, `details.source: 'server_verified'`) and a non-strict account (client SDK, `details.source: 'client_reported'` on failure) — and confirm every one produces exactly one `auditLogs` entry, none editable/deletable from any UI or direct API path.
- [ ] **Step 8:** Record the outcome of Steps 1–7 back to the user, including explicit pass/fail per exit criterion and a reminder of the open Design Decision #4 assumptions that may need correcting before Phase 2.

---

## Self-Review Notes

- **Spec coverage:** Scaffold (Task 1), branches+seed (Task 2), auth/permissions 3-layer (Tasks 3–6), staff CRUD (Task 6), core admin — roles/departments/branches/settings/audit (Tasks 7–11), dashboard/nav (Task 12), exit criteria (Task 13). All six numbered scope sections and all six exit criteria have a task.
- **Placeholder scan:** No TBD/"add error handling"/"similar to Task N without code" — Tasks 7–9 explicitly describe the delta from Task 6's fully-shown pattern rather than omitting code, since department/branch/settings CRUD are genuinely smaller versions of the same shape and repeating ~80 lines of near-identical CRUD three more times added length without adding information.
- **Type consistency:** `RoleId`/`Capability`/`hasCapability` (Task 3) → used identically in Tasks 5, 6, 7, 8, 9, 10, 11, 12. `SessionUser`/`getSessionUser`/`requireCapability`/`AuthError` (Task 3) → used identically everywhere an API route or Server Component needs auth. `writeAuditLog`/`AuditAction` (Task 4) → used identically in Tasks 5 and 6, only called from server code. `sessionCookieOptions`/`SESSION_COOKIE_NAME` (Task 3) → used identically in Tasks 5 and middleware.
