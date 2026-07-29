# Phase 39 — Dynamic Role Capability Editing (Foundation + Management UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `super_admin` adjust which capabilities each of the fourteen existing roles holds, backed by a Firestore-stored override layer that sits in front of the permanent hardcoded `ROLE_CAPABILITIES` default, without making `hasCapability`'s 43 existing call sites async and without introducing a caching-staleness window.

**Architecture:** A new `roleCapabilityOverrides` collection (one doc per overridden role, complete-replacement semantics). Overrides are resolved once per request, inside the existing `getSessionUser()` call (already async, already the sole per-request point every capability check traces back to), and attached to the returned `SessionUser` as `effectiveCapabilities: Capability[] | null`. A new function `hasEffectiveCapability(user, capability)` consults the override if present, falling back to the existing, byte-unchanged `hasCapability(role, capability)` otherwise. Every existing call site is swept from `hasCapability(user.role, X)` to `hasEffectiveCapability(user, X)` — mechanical, synchronous-to-synchronous, no new async boundary anywhere. `super_admin` is permanently excluded from this mechanism (never has an override, never checked against one). Write access is gated by a new capability, `admin.roleOverrides.manage`, hardcoded to `['super_admin']` only — and no override can ever grant this specific capability to any role, closing the one self-referential escalation path this feature could otherwise open.

**Tech Stack:** Next.js (App Router, Server Components + API routes), Firebase Admin SDK / Firestore, Vitest + Firestore/Auth emulators.

## Investigation findings (already completed, informing every task below — do not re-investigate)

- `hasCapability(role, capability)` (`src/lib/auth/permissions.ts:365`) is a pure, synchronous function: `ROLE_CAPABILITIES[capability].includes(role)`. **43 call expressions across 27 files.** Every one derives its `role` argument from a `SessionUser`-resolved value, directly or via a threaded prop — none checks an arbitrary, session-unrelated role.
- `getSessionUser()` (`src/lib/auth/server-guard.ts:21`) is already async (awaits `cookies()` and `verifySessionCookie()`) and is the one per-request point every capability check traces back to, directly (`requireCapability`/`requireAnyCapability`) or indirectly (a prop threaded from a Server Component that already called it).
- Exactly one call site is client-side: `src/components/layout/Sidebar.tsx` (`'use client'`, nav-link visibility only — not a security boundary). It receives `role` as a prop from `NavShell.tsx` (also client), which receives the **entire** `SessionUser` object as a prop from `src/app/(dashboard)/layout.tsx` (a Server Component calling `getSessionUser()` once per request already).
- Cloud Functions (`functions/src`) never reference `hasCapability`/`ROLE_CAPABILITIES` — zero involvement, out of scope for this phase.
- `firestore.rules` independently hardcodes role lists in exactly two places (`auditLogs`, `staff`), each already commented "keep in sync with `ROLE_CAPABILITIES[...]`" — pre-existing manual-sync debt, not created by this phase. **Confirmed and accepted for this phase**: these two rules will continue enforcing the original hardcoded default regardless of any override. This is safe because — independently confirmed by grep — `getFirebaseDb()` (the client Firestore SDK accessor, `src/lib/firebase/client.ts:22`) has zero consumers anywhere in `src/` outside its own definition. This app makes no direct client-side Firestore reads or writes, ever; both of these rules are pure defense-in-depth against a hypothetical direct-client-SDK attack, not something any of this app's actual features exercise.
- `super_admin`'s access is not a special-cased bypass anywhere in the code — every single `ROLE_CAPABILITIES[...]` value (`ADMIN_HR`, `GENERAL_MANAGER_HR`, `CLINICAL_ROLES`, `ALL_ROLES`, every one of them) explicitly lists `'super_admin'` as a member. This is why the "essential oversight" guardrail (see Task 1) can never actually be triggered against this app's real, current data — `super_admin` structurally always holds every capability, and this phase permanently excludes `super_admin` from ever having an override. The guardrail is still implemented as real, tested code (per the exit criteria), proven against a synthetic reduced dataset in its own unit test, not asserted as untestable.
- Next.js's client-side Router Cache may reuse a rendered `(dashboard)/layout.tsx` output across soft navigations without re-invoking `getSessionUser()` every single time — so `Sidebar`'s nav-link visibility could theoretically lag slightly behind a just-saved override until a hard reload. This is a UI-only staleness risk, not a security question: every actual page/API-level check re-verifies fresh on its own dynamic render regardless.

## Global Constraints

- `hasCapability(role, capability)` itself is **never modified** — it stays the permanent, always-present, byte-identical safety-net default. Its existing snapshot test (`tests/unit/permissions.test.ts`) must pass unchanged, proving no regression to default behavior.
- `super_admin` can never have an override — enforced at the write path (reject any attempt to write `roleCapabilityOverrides/super_admin`) and, belt-and-suspenders, at the read/resolve path (even if such a document somehow existed by direct Firestore manipulation, resolution logic must ignore it for `super_admin`).
- An override, when it exists for a role, is a **complete replacement** of that role's capability set — never a delta merged with the hardcoded default.
- `admin.roleOverrides.manage` (the capability gating this entire feature) can **never** be included in any override's capability list, for any role — closes the self-referential escalation path.
- Only `super_admin` may view or edit overrides. Not `admin`, despite `admin` holding other roles-adjacent capabilities today.
- Every override write (set or revert-to-default) writes a real audit log entry, matching this project's existing before/after convention (see TD-1's resolution).
- This phase adjusts capabilities of the existing fourteen roles only. Nothing about it may create a new role, or make custom-role creation possible even accidentally — if any task implementation implies this, stop and flag it rather than building it.
- Task 2 and Task 5 (runtime resolution core, and the override-write API route) require **Opus-tier review**, per this project's standing rule for the highest-stakes security-adjacent changes — matching the rigor Phase 38.6's `super_admin` guard fix received.
- No task in this plan touches `firestore.rules` beyond adding one new, fully-closed rule for the new collection (Task 7) — the two pre-existing hardcoded-role rules are explicitly left alone per the investigation findings above.

---

### Task 1: Data model, capability, and guardrail validation logic (pure, no I/O)

**Files:**
- Modify: `src/lib/auth/permissions.ts`
- Create: `src/lib/auth/roleOverrideValidation.ts`
- Test: `tests/unit/roleOverrideValidation.test.ts`

**Interfaces:**
- Produces: `Capability` union gains `'admin.roleOverrides.manage'`; `ROLE_CAPABILITIES`/`CAPABILITY_MODULE` gain an entry for it; a new exported `validateRoleCapabilityOverride(role: RoleId, newCapabilities: Capability[]): RoleOverrideValidationError | null` and a lower-level, explicitly-parameterized `wouldRemoveEssentialOversight(proposedRole: RoleId, proposedCapabilities: Capability[], allRoles: readonly RoleId[], defaultCapabilities: (role: RoleId, capability: Capability) => boolean, currentOverrides: Partial<Record<RoleId, Capability[]>>, essentialCapabilities: Capability[]): boolean` (parameterized specifically so its unit test can exercise a genuine rejection with a synthetic dataset, since this app's real `ROLES` can never trigger it — see Step 4).
- Consumes: nothing new — this task has zero dependencies on other tasks.

- [ ] **Step 1: Add the new capability to the type/module/role maps**

In `src/lib/auth/permissions.ts`, add to the `Capability` union (after the `payroll.record.view` line):

```ts
  | 'payroll.record.create'
  | 'payroll.record.view'
  // Phase 39 — Dynamic Role Capability Editing. Gates viewing/editing the
  // roleCapabilityOverrides collection itself. Permanently super_admin-only
  // — see ROLE_OVERRIDES_MANAGE_ROLES below and
  // validateRoleCapabilityOverride's self-referential-escalation check:
  // no override may ever grant this capability to any role.
  | 'admin.roleOverrides.manage'
```

Add to `CAPABILITY_MODULE` (after `'payroll.record.view': 'accounting',`):

```ts
  'payroll.record.view': 'accounting',
  'admin.roleOverrides.manage': 'admin',
```

Add a new constant near `ADMIN_IT`'s definition (after `const ADMIN_IT: RoleId[] = ['super_admin', 'admin', 'it_admin']`):

```ts
// Phase 39 — permanently exactly one role. Not extended to admin despite
// admin holding other roles-adjacent capabilities (admin.roles.view/assign)
// — this is the single highest-leverage capability-adjacent action in the
// system, deliberately not shared. Never editable via an override itself
// (validateRoleCapabilityOverride rejects any attempt to include this
// capability in an override's list, for any role).
const ROLE_OVERRIDES_MANAGE_ROLES: RoleId[] = ['super_admin']
```

Add to `ROLE_CAPABILITIES` (after `'payroll.record.view': PAYROLL_RECORD_VIEW_ROLES,`):

```ts
  'payroll.record.view': PAYROLL_RECORD_VIEW_ROLES,
  'admin.roleOverrides.manage': ROLE_OVERRIDES_MANAGE_ROLES,
```

- [ ] **Step 2: Add `hasEffectiveCapability`, structurally typed to avoid a circular import**

In `src/lib/auth/permissions.ts`, immediately after the existing `hasCapability` function:

```ts
// Phase 39 — the override-aware capability check. Takes a structural
// shape (not the full SessionUser type) specifically to avoid a circular
// import: SessionUser is defined in server-guard.ts, which already
// imports hasCapability from this file. effectiveCapabilities is the
// pre-resolved override for this user's role — null means no override
// exists, fall back to the permanent hardcoded default. This is the ONLY
// place override vs. default is decided; hasCapability itself never
// changes.
export function hasEffectiveCapability(
  user: { role: RoleId; effectiveCapabilities: Capability[] | null },
  capability: Capability
): boolean {
  if (user.effectiveCapabilities) return user.effectiveCapabilities.includes(capability)
  return hasCapability(user.role, capability)
}
```

- [ ] **Step 3: Write the failing tests for the new capability wiring**

Create `tests/unit/roleOverrideValidation.test.ts` (this step's tests; Step 4 adds the guardrail-function tests to the same file):

```ts
import { describe, it, expect } from 'vitest'
import { ROLE_CAPABILITIES, hasCapability, hasEffectiveCapability, type Capability, type RoleId } from '@/lib/auth/permissions'

describe('admin.roleOverrides.manage capability', () => {
  it('is exactly [super_admin]', () => {
    expect(ROLE_CAPABILITIES['admin.roleOverrides.manage']).toEqual(['super_admin'])
  })

  it('no other role holds it by default', () => {
    const others: RoleId[] = ['admin', 'branch_manager', 'hr_admin', 'finance_admin', 'it_admin', 'cashier', 'doctor', 'medical_secretary', 'protocol', 'general_manager', 'inventory_manager', 'nurse', 'lab_staff']
    for (const role of others) {
      expect(hasCapability(role, 'admin.roleOverrides.manage')).toBe(false)
    }
  })
})

describe('hasEffectiveCapability', () => {
  it('falls back to hasCapability when effectiveCapabilities is null (no override)', () => {
    const user = { role: 'branch_manager' as RoleId, effectiveCapabilities: null }
    expect(hasEffectiveCapability(user, 'inventory.stock.view')).toBe(hasCapability('branch_manager', 'inventory.stock.view'))
    expect(hasEffectiveCapability(user, 'admin.roleOverrides.manage')).toBe(false)
  })

  it('uses effectiveCapabilities exclusively when present, ignoring the hardcoded default entirely', () => {
    // branch_manager does NOT hold accounting.pnl.view by default — an
    // override can still grant it, proving the override is a full
    // replacement, not a delta merged with the default.
    expect(hasCapability('branch_manager', 'accounting.pnl.view')).toBe(false)
    const overridden = { role: 'branch_manager' as RoleId, effectiveCapabilities: ['accounting.pnl.view'] as Capability[] }
    expect(hasEffectiveCapability(overridden, 'accounting.pnl.view')).toBe(true)
    // And the override REMOVES a capability the default grants, proving
    // it's a replacement, not additive.
    expect(hasCapability('branch_manager', 'inventory.stock.view')).toBe(true)
    expect(hasEffectiveCapability(overridden, 'inventory.stock.view')).toBe(false)
  })
})
```

- [ ] **Step 4: Run the tests to verify they pass (this step's additions are all pure wiring, expected to pass immediately given Steps 1-2)**

```bash
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
npm test -- roleOverrideValidation
```

Expected: PASS (this file has no emulator dependency at all — it's pure — but this project's `npm test` always runs through `firebase emulators:exec`, so use the full command above rather than a bare `vitest run`, matching this repo's own established quirk).

- [ ] **Step 5: Write `validateRoleCapabilityOverride` and the parameterized `wouldRemoveEssentialOversight`**

Create `src/lib/auth/roleOverrideValidation.ts`:

```ts
import { ROLES, ROLE_CAPABILITIES, hasCapability, type RoleId, type Capability } from './permissions'

// Capabilities considered "essential oversight" for Phase 39's guardrail.
// super_admin is a member of every ROLE_CAPABILITIES array (confirmed by
// direct reading of every constant in permissions.ts) and is permanently
// excluded from ever having an override — so in this app's REAL data,
// wouldRemoveEssentialOversight below can never actually return true.
// It is still implemented and tested for real, against a synthetic
// dataset that omits super_admin, to prove the algorithm is sound rather
// than asserting the scenario is untestable.
export const ESSENTIAL_OVERSIGHT_CAPABILITIES: Capability[] = ['admin.auditLog.view']

export interface RoleOverrideValidationError {
  reason: 'super_admin_immutable' | 'self_referential_escalation' | 'essential_oversight_removed'
  message: string
}

// Parameterized deliberately: allRoles/defaultHasCapability/currentOverrides
// are passed explicitly rather than read from module-level globals, so a
// unit test can exercise a genuine rejection with a hypothetical reduced
// role set — proving this rejects a real zero-coverage case, not just
// documenting that one can't occur.
export function wouldRemoveEssentialOversight(
  proposedRole: RoleId,
  proposedCapabilities: Capability[],
  allRoles: readonly RoleId[],
  defaultHasCapability: (role: RoleId, capability: Capability) => boolean,
  currentOverrides: Partial<Record<RoleId, Capability[]>>,
  essentialCapabilities: Capability[] = ESSENTIAL_OVERSIGHT_CAPABILITIES
): boolean {
  for (const capability of essentialCapabilities) {
    const stillHeldByAnyone = allRoles.some((role) => {
      const effective = role === proposedRole ? proposedCapabilities : currentOverrides[role]
      if (effective) return effective.includes(capability)
      return defaultHasCapability(role, capability)
    })
    if (!stillHeldByAnyone) return true
  }
  return false
}

// Real call site's entry point — always runs against this app's actual
// ROLES/hasCapability, so wouldRemoveEssentialOversight's essential-
// oversight branch structurally can never fire here (super_admin always
// holds every ESSENTIAL_OVERSIGHT_CAPABILITIES entry and is excluded from
// currentOverrides entirely) — the super_admin-immutable and
// self-referential-escalation checks are the two that can actually
// trigger in production.
export function validateRoleCapabilityOverride(
  role: RoleId,
  newCapabilities: Capability[],
  currentOverrides: Partial<Record<RoleId, Capability[]>>
): RoleOverrideValidationError | null {
  if (role === 'super_admin') {
    return { reason: 'super_admin_immutable', message: "super_admin's capabilities cannot be edited through this mechanism." }
  }
  if (newCapabilities.includes('admin.roleOverrides.manage')) {
    return { reason: 'self_referential_escalation', message: 'admin.roleOverrides.manage can never be granted through an override.' }
  }
  if (wouldRemoveEssentialOversight(role, newCapabilities, ROLES, hasCapability, currentOverrides)) {
    return { reason: 'essential_oversight_removed', message: 'This change would leave no role able to review the audit log.' }
  }
  return null
}
```

- [ ] **Step 6: Write the failing tests for both functions, including the synthetic zero-coverage proof**

Append to `tests/unit/roleOverrideValidation.test.ts`:

```ts
import { validateRoleCapabilityOverride, wouldRemoveEssentialOversight, ESSENTIAL_OVERSIGHT_CAPABILITIES } from '@/lib/auth/roleOverrideValidation'

describe('validateRoleCapabilityOverride', () => {
  it('rejects any attempt to edit super_admin', () => {
    const result = validateRoleCapabilityOverride('super_admin', ['admin.auditLog.view'], {})
    expect(result?.reason).toBe('super_admin_immutable')
  })

  it('rejects an override that includes admin.roleOverrides.manage, for any role', () => {
    const result = validateRoleCapabilityOverride('branch_manager', ['admin.roleOverrides.manage'], {})
    expect(result?.reason).toBe('self_referential_escalation')
  })

  it('accepts a normal, safe capability change', () => {
    const result = validateRoleCapabilityOverride('branch_manager', ['inventory.stock.view', 'accounting.pnl.view'], {})
    expect(result).toBeNull()
  })

  it('accepts stripping admin.auditLog.view from a single role, since super_admin (excluded from all overrides) always retains it', () => {
    const result = validateRoleCapabilityOverride('admin', [], {})
    expect(result).toBeNull()
  })
})

describe('wouldRemoveEssentialOversight — proof against a synthetic dataset without super_admin', () => {
  const fakeRoles = ['admin', 'it_admin'] as const
  const fakeDefaultHasCapability = (role: string, capability: Capability) =>
    capability === 'admin.auditLog.view' && (role === 'admin' || role === 'it_admin')

  it('correctly detects a genuine zero-coverage removal when the last holder loses the capability and no super_admin is present', () => {
    // it_admin's override already stripped admin.auditLog.view; now
    // admin's own change also strips it — nobody in this synthetic
    // roster holds it anymore.
    const result = wouldRemoveEssentialOversight(
      'admin',
      [],
      fakeRoles as unknown as RoleId[],
      fakeDefaultHasCapability as unknown as (role: RoleId, capability: Capability) => boolean,
      { it_admin: [] } as Partial<Record<RoleId, Capability[]>>,
      ['admin.auditLog.view']
    )
    expect(result).toBe(true)
  })

  it('correctly allows the same change when a third role still holds the capability', () => {
    const result = wouldRemoveEssentialOversight(
      'admin',
      [],
      fakeRoles as unknown as RoleId[],
      fakeDefaultHasCapability as unknown as (role: RoleId, capability: Capability) => boolean,
      {} as Partial<Record<RoleId, Capability[]>>, // it_admin keeps its default, still holds it
      ['admin.auditLog.view']
    )
    expect(result).toBe(false)
  })

  it('the real ESSENTIAL_OVERSIGHT_CAPABILITIES list is exactly [admin.auditLog.view]', () => {
    expect(ESSENTIAL_OVERSIGHT_CAPABILITIES).toEqual(['admin.auditLog.view'])
  })
})
```

- [ ] **Step 7: Run the tests to verify all pass**

```bash
npm test -- roleOverrideValidation
```

Expected: PASS, all cases including the synthetic zero-coverage proof.

- [ ] **Step 8: Run the full suite to confirm no regression to the existing role×capability snapshot**

```bash
npm test
```

Expected: all passing, including `tests/unit/permissions.test.ts`'s exact-match snapshot test (must be unchanged — the snapshot itself does not need regenerating, since `hasCapability` and every existing `ROLE_CAPABILITIES` entry are untouched; only a new capability key was added, which the snapshot test's `Object.keys(ROLE_CAPABILITIES)` will now also iterate — if the snapshot fails because of the new key appearing, that's expected and the snapshot must be regenerated with `npm test -- -u` and the new file diffed to confirm ONLY the new `admin.roleOverrides.manage` column was added, no existing cell changed).

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth/permissions.ts src/lib/auth/roleOverrideValidation.ts tests/unit/roleOverrideValidation.test.ts tests/unit/__snapshots__/permissions.test.ts.snap
git commit -m "feat(permissions): add admin.roleOverrides.manage capability + override validation logic"
```

---

### Task 2: Runtime resolution — `getSessionUser()` reads the override, `hasEffectiveCapability` becomes the real gate in `requireCapability`/`requireAnyCapability`

**⚠️ Opus-tier review required — this is the per-request resolution core every capability check in the app will depend on.**

**Files:**
- Create: `src/lib/auth/roleOverrides.ts`
- Modify: `src/lib/auth/server-guard.ts`
- Test: `tests/integration/roleOverrideResolution.test.ts`

**Interfaces:**
- Consumes: `hasEffectiveCapability` (Task 1, `src/lib/auth/permissions.ts`).
- Produces: `SessionUser` gains `effectiveCapabilities: Capability[] | null`; `getRoleOverride(role: RoleId): Promise<Capability[] | null>` and `getAllRoleOverrides(): Promise<Partial<Record<RoleId, Capability[]>>>` (the latter consumed by Task 6's UI, not by this task's own runtime path).

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/roleOverrideResolution.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { requireCapability } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('getSessionUser / requireCapability — role capability override resolution', () => {
  let branchA: string
  let branchManagerCookie: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Override Resolution Test Branch A')
    branchA = a.id
    branchManagerCookie = (await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'bm-override@test.local' })).sessionCookie
  })

  it('with no override doc for the role, requireCapability behaves exactly per the hardcoded default', async () => {
    // branch_manager holds inventory.stock.view by default, not accounting.pnl.view.
    await withSession(branchManagerCookie, async () => {
      await expect(requireCapability('inventory.stock.view')).resolves.toBeTruthy()
      await expect(requireCapability('accounting.pnl.view')).rejects.toThrow('Forbidden')
    })
  })

  it('once an override doc exists for the role, requireCapability uses it exclusively, not merged with the default', async () => {
    const db = getAdminFirestore()
    await db.collection('roleCapabilityOverrides').doc('branch_manager').set({
      role: 'branch_manager',
      capabilities: ['accounting.pnl.view'],
      updatedAt: new Date(),
      updatedBy: 'test-harness',
    })
    await withSession(branchManagerCookie, async () => {
      // Now granted, despite not being in the hardcoded default.
      await expect(requireCapability('accounting.pnl.view')).resolves.toBeTruthy()
      // And now REVOKED, despite being in the hardcoded default — proves
      // replacement semantics, not a delta merge.
      await expect(requireCapability('inventory.stock.view')).rejects.toThrow('Forbidden')
    })
    await db.collection('roleCapabilityOverrides').doc('branch_manager').delete()
  })

  it('after the override doc is deleted, behavior reverts to the hardcoded default on the very next request — no staleness window', async () => {
    await withSession(branchManagerCookie, async () => {
      await expect(requireCapability('inventory.stock.view')).resolves.toBeTruthy()
      await expect(requireCapability('accounting.pnl.view')).rejects.toThrow('Forbidden')
    })
  })

  it('a super_admin account is never affected by any override doc, even one manually written for the super_admin role', async () => {
    const db = getAdminFirestore()
    await db.collection('roleCapabilityOverrides').doc('super_admin').set({
      role: 'super_admin',
      capabilities: [], // maximally hostile: an override that would strip everything
      updatedAt: new Date(),
      updatedBy: 'test-harness',
    })
    const superAdminCookie = (await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-override@test.local' })).sessionCookie
    await withSession(superAdminCookie, async () => {
      // Still holds everything — the resolve path must ignore this doc for super_admin.
      await expect(requireCapability('admin.roleOverrides.manage')).resolves.toBeTruthy()
      await expect(requireCapability('accounting.pnl.view')).resolves.toBeTruthy()
    })
    await db.collection('roleCapabilityOverrides').doc('super_admin').delete()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- roleOverrideResolution
```

Expected: FAIL — `roleCapabilityOverrides` doesn't exist as a concept yet; `SessionUser` has no `effectiveCapabilities` field; `getSessionUser` doesn't read the collection.

- [ ] **Step 3: Create `src/lib/auth/roleOverrides.ts`**

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { RoleId, Capability } from './permissions'

// Single-doc read, keyed by role — matches this codebase's dominant
// per-request existence-check idiom (every PATCH route reads its
// `existing` doc the same way). super_admin is structurally excluded:
// it never has a doc (the write path refuses to create one — Task 5),
// and this function refuses to even look regardless, belt-and-suspenders
// against a document manually created outside the app's own write path.
export async function getRoleOverride(role: RoleId): Promise<Capability[] | null> {
  if (role === 'super_admin') return null
  const db = getAdminFirestore()
  const doc = await db.collection('roleCapabilityOverrides').doc(role).get()
  return doc.exists ? (doc.data()!.capabilities as Capability[]) : null
}

// Used by Task 6's UI to render every role's effective set in one page
// load, without one Firestore read per role. Not used by the per-request
// resolution path (getSessionUser calls getRoleOverride, a single-doc
// read for exactly the acting user's own role — cheaper than a full
// collection scan on every request).
export async function getAllRoleOverrides(): Promise<Partial<Record<RoleId, Capability[]>>> {
  const db = getAdminFirestore()
  const snap = await db.collection('roleCapabilityOverrides').get()
  const result: Partial<Record<RoleId, Capability[]>> = {}
  for (const doc of snap.docs) {
    result[doc.id as RoleId] = doc.data().capabilities as Capability[]
  }
  return result
}
```

- [ ] **Step 4: Update `SessionUser` and `getSessionUser()` in `src/lib/auth/server-guard.ts`**

Change:

```ts
import { hasCapability, type Capability, type RoleId } from './permissions'

export interface SessionUser {
  uid: string
  email: string
  role: RoleId
  branchId: string
}
```

to:

```ts
import { hasEffectiveCapability, type Capability, type RoleId } from './permissions'
import { getRoleOverride } from './roleOverrides'

export interface SessionUser {
  uid: string
  email: string
  role: RoleId
  branchId: string
  // Phase 39 — null means no override exists for this role; the
  // hardcoded default applies. Resolved once per request, here, so
  // hasEffectiveCapability never needs to be async at any of its call
  // sites.
  effectiveCapabilities: Capability[] | null
}
```

Change `getSessionUser`'s body:

```ts
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionCookie) return null

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true)
    if (!decoded.role || !decoded.branchId) return null
    const role = decoded.role as RoleId
    const effectiveCapabilities = await getRoleOverride(role)
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      role,
      branchId: decoded.branchId as string,
      effectiveCapabilities,
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Update `requireCapability`/`requireAnyCapability` to use `hasEffectiveCapability`**

Change:

```ts
export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!hasCapability(user.role, capability)) throw new AuthError('Forbidden', 403)
  return user
}

export async function requireAnyCapability(capabilities: Capability[]): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!capabilities.some((c) => hasCapability(user.role, c))) throw new AuthError('Forbidden', 403)
  return user
}
```

to:

```ts
export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!hasEffectiveCapability(user, capability)) throw new AuthError('Forbidden', 403)
  return user
}

export async function requireAnyCapability(capabilities: Capability[]): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!capabilities.some((c) => hasEffectiveCapability(user, c))) throw new AuthError('Forbidden', 403)
  return user
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm test -- roleOverrideResolution
```

Expected: PASS, all 4 cases.

- [ ] **Step 7: Run the full suite to confirm no regression**

```bash
npm test
```

Expected: all passing. Every existing test seeds staff via `seedStaff()` (`tests/setup/fixtures.ts`), which sets custom claims only — no `roleCapabilityOverrides` doc ever exists for any test fixture unless a test explicitly creates one (as this task's own new test does, cleaning up after itself), so no existing test's expected behavior changes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/roleOverrides.ts src/lib/auth/server-guard.ts tests/integration/roleOverrideResolution.test.ts
git commit -m "feat(auth): resolve role capability overrides once per request in getSessionUser"
```

- [ ] **Step 9: Flag for Opus-tier review** — this task's diff is the per-request resolution core; dispatch review before proceeding to Task 3.

---

### Task 3: Sweep every server-side `hasCapability(user.role/viewer.role, X)` call site to `hasEffectiveCapability`

**Files (all 26 remaining server-side call sites — `server-guard.ts` was already handled in Task 2):**

- [ ] **Step 1: Apply the mechanical swap to every file below**

In each file, add `hasEffectiveCapability` to the existing `import { hasCapability, ... } from '@/lib/auth/permissions'` (or add a new import line if `hasCapability` isn't otherwise used in that file after the swap — check each file: if the swapped call was the file's only use of `hasCapability`, remove `hasCapability` from the import and add `hasEffectiveCapability` instead; if the file has other `hasCapability` calls that are NOT keyed off the acting user/viewer — none currently do, per the investigation, but verify per-file — keep both imported). Then change every call from `hasCapability(user.role, X)` / `hasCapability(viewer.role, X)` to `hasEffectiveCapability(user, X)` / `hasEffectiveCapability(viewer, X)` — the same variable, not `.role` on it.

Exact call sites (file: line: current call → new call):

1. `src/app/(dashboard)/roles/page.tsx:40`: `hasCapability(user.role, 'admin.roles.assign')` → `hasEffectiveCapability(user, 'admin.roles.assign')`
2. `src/app/(dashboard)/expenses/page.tsx:48`: `hasCapability(user.role, 'accounting.expense.create')` → `hasEffectiveCapability(user, 'accounting.expense.create')`
3. `src/app/(dashboard)/pos/sales/[id]/page.tsx:50`: `hasCapability(user.role, 'pos.sale.void')` → `hasEffectiveCapability(user, 'pos.sale.void')`
4. `src/app/(dashboard)/stock/page.tsx:55`: `hasCapability(user.role, 'inventory.stock.adjust')` → `hasEffectiveCapability(user, 'inventory.stock.adjust')`
5. `src/app/(dashboard)/stock/page.tsx:56`: `hasCapability(user.role, 'inventory.stock.transfer')` → `hasEffectiveCapability(user, 'inventory.stock.transfer')`
6. `src/app/(dashboard)/dashboard/page.tsx:35`: `hasCapability(user.role, 'reports.sales.view')` → `hasEffectiveCapability(user, 'reports.sales.view')`
7. `src/app/(dashboard)/dashboard/page.tsx:36`: `hasCapability(user.role, 'inventory.stock.view')` → `hasEffectiveCapability(user, 'inventory.stock.view')`
8. `src/app/(dashboard)/dashboard/page.tsx:37`: `hasCapability(user.role, 'pos.delivery.fulfill')` → `hasEffectiveCapability(user, 'pos.delivery.fulfill')`
9. `src/app/(dashboard)/dashboard/page.tsx:38`: `hasCapability(user.role, 'dashboard.activity.view')` → `hasEffectiveCapability(user, 'dashboard.activity.view')`
10. `src/app/(dashboard)/dashboard/page.tsx:39`: `hasCapability(user.role, 'clinical.appointments.manage')` → `hasEffectiveCapability(user, 'clinical.appointments.manage')`
11. `src/app/(dashboard)/dashboard/page.tsx:40`: `hasCapability(user.role, 'clinical.lab.results.enter')` → `hasEffectiveCapability(user, 'clinical.lab.results.enter')`
12. `src/app/(dashboard)/dashboard/page.tsx:41`: `hasCapability(user.role, 'hr.leave.approve')` → `hasEffectiveCapability(user, 'hr.leave.approve')`
13. `src/app/(dashboard)/seminars/page.tsx:43`: `hasCapability(user.role, 'seminars.manage')` → `hasEffectiveCapability(user, 'seminars.manage')`
14. `src/app/(dashboard)/seminars/[id]/page.tsx:25`: `hasCapability(user.role, 'seminars.manage')` → `hasEffectiveCapability(user, 'seminars.manage')`
15. `src/app/(dashboard)/seminars/[id]/page.tsx:26`: `hasCapability(user.role, 'seminars.attendance.record')` → `hasEffectiveCapability(user, 'seminars.attendance.record')`
16. `src/app/(dashboard)/seminars/[id]/page.tsx:27`: `hasCapability(user.role, 'seminars.attendance.view')` → `hasEffectiveCapability(user, 'seminars.attendance.view')`
17. `src/app/(dashboard)/customers/[id]/page.tsx:103`: `hasCapability(user.role, 'crm.customer.manage')` → `hasEffectiveCapability(user, 'crm.customer.manage')`
18. `src/app/(dashboard)/customers/[id]/page.tsx:104`: `hasCapability(user.role, 'crm.customer.view')` → `hasEffectiveCapability(user, 'crm.customer.view')`
19. `src/app/(dashboard)/customers/[id]/page.tsx:105`: `hasCapability(user.role, 'clinical.record.view')` → `hasEffectiveCapability(user, 'clinical.record.view')`
20. `src/app/(dashboard)/customers/[id]/page.tsx:106`: `hasCapability(user.role, 'clinical.record.create')` → `hasEffectiveCapability(user, 'clinical.record.create')`
21. `src/app/(dashboard)/customers/[id]/page.tsx:107`: `hasCapability(user.role, 'clinical.appointments.manage')` → `hasEffectiveCapability(user, 'clinical.appointments.manage')`
22. `src/app/(dashboard)/customers/[id]/page.tsx:111`: `hasCapability(user.role, 'clinical.lab.view')` → `hasEffectiveCapability(user, 'clinical.lab.view')`
23. `src/app/(dashboard)/customers/[id]/page.tsx:112`: `hasCapability(user.role, 'clinical.lab.order')` → `hasEffectiveCapability(user, 'clinical.lab.order')`
24. `src/app/(dashboard)/customers/[id]/page.tsx:113`: `hasCapability(user.role, 'clinical.lab.results.enter')` → `hasEffectiveCapability(user, 'clinical.lab.results.enter')`
25. `src/app/(dashboard)/customers/[id]/page.tsx:116`: `hasCapability(user.role, 'seminars.attendance.view')` → `hasEffectiveCapability(user, 'seminars.attendance.view')`
26. `src/app/(dashboard)/customers/[id]/page.tsx:120`: `hasCapability(user.role, 'pos.delivery.fulfill')` → `hasEffectiveCapability(user, 'pos.delivery.fulfill')`
27. `src/app/(dashboard)/customers/[id]/page.tsx:124`: `hasCapability(user.role, 'clinical.intake.view')` → `hasEffectiveCapability(user, 'clinical.intake.view')`
28. `src/app/(dashboard)/customers/[id]/page.tsx:125`: `hasCapability(user.role, 'clinical.intake.record')` → `hasEffectiveCapability(user, 'clinical.intake.record')`
29. `src/app/(dashboard)/customers/page.tsx:30`: `hasCapability(user.role, 'crm.customer.create')` → `hasEffectiveCapability(user, 'crm.customer.create')`
30. `src/app/(dashboard)/payroll/page.tsx:31`: `hasCapability(user.role, 'payroll.record.create')` → `hasEffectiveCapability(user, 'payroll.record.create')`
31. `src/app/api/attachments/[id]/route.ts:27`: `hasCapability(user.role, view)` → `hasEffectiveCapability(user, view)` (note: `view` here is already a `Capability`-typed variable, not a literal — the swap is the same shape)
32. `src/app/api/attachments/route.ts:32`: `hasCapability(user.role, manage)` → `hasEffectiveCapability(user, manage)`
33. `src/lib/dashboard/lowStockSummary.ts:29`: `hasCapability(viewer.role, 'inventory.stock.view')` → `hasEffectiveCapability(viewer, 'inventory.stock.view')`
34. `src/lib/dashboard/revenueTrend.ts:20`: `hasCapability(user.role, 'reports.sales.view')` → `hasEffectiveCapability(user, 'reports.sales.view')`
35. `src/lib/dashboard/pendingLeaveApprovals.ts:20`: `hasCapability(viewer.role, 'hr.leave.approve')` → `hasEffectiveCapability(viewer, 'hr.leave.approve')`
36. `src/lib/dashboard/recentActivity.ts:44`: `hasCapability(viewer.role, 'dashboard.activity.view')` → `hasEffectiveCapability(viewer, 'dashboard.activity.view')`
37. `src/lib/dashboard/pendingDeliveriesSummary.ts:20`: `hasCapability(viewer.role, 'pos.delivery.fulfill')` → `hasEffectiveCapability(viewer, 'pos.delivery.fulfill')`
38. `src/lib/clinical/getSeminarAttendance.ts:37`: `hasCapability(viewer.role, 'seminars.attendance.view')` → `hasEffectiveCapability(viewer, 'seminars.attendance.view')`
39. `src/lib/clinical/getLabRecords.ts:59`: `hasCapability(viewer.role, 'clinical.lab.view')` → `hasEffectiveCapability(viewer, 'clinical.lab.view')`
40. `src/lib/clinical/getPendingLabOrders.ts:25`: `hasCapability(viewer.role, 'clinical.lab.results.enter')` → `hasEffectiveCapability(viewer, 'clinical.lab.results.enter')`
41. `src/lib/clinical/getAppointments.ts:35`: `hasCapability(viewer.role, 'clinical.appointments.manage')` → `hasEffectiveCapability(viewer, 'clinical.appointments.manage')`
42. `src/lib/clinical/getPatientIntake.ts:42`: `hasCapability(viewer.role, 'clinical.intake.view')` → `hasEffectiveCapability(viewer, 'clinical.intake.view')`
43. `src/lib/clinical/getPatientTreatments.ts:25`: `hasCapability(viewer.role, 'clinical.record.view')` → `hasEffectiveCapability(viewer, 'clinical.record.view')`
44. `src/lib/pos/getPendingDeliveries.ts:27`: `hasCapability(viewer.role, 'pos.delivery.fulfill')` → `hasEffectiveCapability(viewer, 'pos.delivery.fulfill')`
45. `src/lib/pos/getSaleDetail.ts:50`: `hasCapability(viewer.role, 'pos.sale.view')` → `hasEffectiveCapability(viewer, 'pos.sale.view')`

(45 listed here — a few more than the investigation's raw count since some files have multiple call expressions; this is the complete, exhaustive list. `Sidebar.tsx` is deliberately NOT in this list — it's handled separately in Task 4, since it's client-side and needs prop-threading, not a same-shape swap.)

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean. A file where `hasCapability`'s import was removed but is still referenced elsewhere would surface here immediately.

- [ ] **Step 3: Run the full suite**

```bash
npm test
```

Expected: all passing, unchanged count — this is a pure signature-shape swap with no behavior change for any role that has no override (confirmed by Task 2's own regression test and this test run together).

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/roles/page.tsx src/app/\(dashboard\)/expenses/page.tsx src/app/\(dashboard\)/pos/sales/\[id\]/page.tsx src/app/\(dashboard\)/stock/page.tsx src/app/\(dashboard\)/dashboard/page.tsx src/app/\(dashboard\)/seminars/page.tsx src/app/\(dashboard\)/seminars/\[id\]/page.tsx src/app/\(dashboard\)/customers/\[id\]/page.tsx src/app/\(dashboard\)/customers/page.tsx src/app/\(dashboard\)/payroll/page.tsx src/app/api/attachments/\[id\]/route.ts src/app/api/attachments/route.ts src/lib/dashboard/lowStockSummary.ts src/lib/dashboard/revenueTrend.ts src/lib/dashboard/pendingLeaveApprovals.ts src/lib/dashboard/recentActivity.ts src/lib/dashboard/pendingDeliveriesSummary.ts src/lib/clinical/getSeminarAttendance.ts src/lib/clinical/getLabRecords.ts src/lib/clinical/getPendingLabOrders.ts src/lib/clinical/getAppointments.ts src/lib/clinical/getPatientIntake.ts src/lib/clinical/getPatientTreatments.ts src/lib/pos/getPendingDeliveries.ts src/lib/pos/getSaleDetail.ts
git commit -m "refactor(auth): sweep all server-side hasCapability call sites to hasEffectiveCapability"
```

---

### Task 4: Client-side threading — `Sidebar.tsx` mirrors the resolved capability set, not a direct `hasCapability` call

**Files:**
- Modify: `src/components/layout/NavShell.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `SessionUser.effectiveCapabilities` (Task 2) — `NavShell` already receives the full `user: SessionUser` object as a prop from `(dashboard)/layout.tsx`, unchanged.

- [ ] **Step 1: Thread `effectiveCapabilities` from `NavShell` to `Sidebar`**

In `src/components/layout/NavShell.tsx`, change both `<Sidebar>` invocations:

```tsx
        <Sidebar role={user.role} variant="persistent" />
```

to:

```tsx
        <Sidebar role={user.role} effectiveCapabilities={user.effectiveCapabilities} variant="persistent" />
```

and:

```tsx
            <Sidebar role={user.role} variant="drawer" />
```

to:

```tsx
            <Sidebar role={user.role} effectiveCapabilities={user.effectiveCapabilities} variant="drawer" />
```

- [ ] **Step 2: Update `Sidebar.tsx`'s props and its capability check**

Read the file first to find its exact current props interface (it takes `role` and `variant` today — add `effectiveCapabilities` alongside them, typed `Capability[] | null`). Change the import line:

```ts
import { hasCapability, type Capability, type RoleId } from '@/lib/auth/permissions'
```

to:

```ts
import { hasEffectiveCapability, type Capability, type RoleId } from '@/lib/auth/permissions'
```

Add `effectiveCapabilities: Capability[] | null` to the component's props interface and destructuring, alongside the existing `role`/`variant` props.

Change the filter call:

```tsx
        const visibleLinks = group.links.filter((link) =>
          (Array.isArray(link.capability) ? link.capability : [link.capability]).some((c) => hasCapability(role, c))
        )
```

to:

```tsx
        const visibleLinks = group.links.filter((link) =>
          (Array.isArray(link.capability) ? link.capability : [link.capability]).some((c) =>
            hasEffectiveCapability({ role, effectiveCapabilities }, c)
          )
        )
```

- [ ] **Step 3: Typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 4: Run the full suite**

```bash
npm test
```

Expected: unchanged (no test exercises `Sidebar.tsx` directly — this project has no component-rendering test framework, confirmed in prior phases; verification here is live/manual, Task 7's job).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/NavShell.tsx src/components/layout/Sidebar.tsx
git commit -m "refactor(nav): thread resolved effectiveCapabilities into Sidebar instead of a direct hasCapability call"
```

---

### Task 5: Override write API — `PUT`/`DELETE /api/role-capability-overrides/[role]`

**⚠️ Opus-tier review required — this is the write path for the single highest-leverage capability-adjacent action in the system.**

**Files:**
- Create: `src/app/api/role-capability-overrides/[role]/route.ts`
- Modify: `src/lib/types/audit.ts`
- Test: `tests/integration/roleCapabilityOverrides.test.ts`

**Interfaces:**
- Consumes: `validateRoleCapabilityOverride` (Task 1), `getAllRoleOverrides`/`getRoleOverride` (Task 2), `requireCapability` (Task 2), `writeAuditLog` (existing, `src/lib/audit/log.ts`).
- Produces: the two HTTP endpoints Task 6's UI calls.

- [ ] **Step 1: Add the new audit action**

In `src/lib/types/audit.ts`, add to the `AuditAction` union (after `'attachment_upload'`):

```ts
  | 'attachment_upload'
  | 'role_capability_override_change'
```

- [ ] **Step 2: Write the failing tests**

Create `tests/integration/roleCapabilityOverrides.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { PUT as putOverride, DELETE as deleteOverride } from '@/app/api/role-capability-overrides/[role]/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('PUT/DELETE /api/role-capability-overrides/[role]', () => {
  let branchA: string
  let superAdminCookie: string
  let hrAdminCookie: string
  let superAdminUid: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Role Override Test Branch A')
    branchA = a.id
    const sa = await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-overrides@test.local' })
    superAdminCookie = sa.sessionCookie
    superAdminUid = sa.uid
    hrAdminCookie = (await seedStaff({ role: 'hr_admin', branchId: branchA, email: 'hr-overrides@test.local' })).sessionCookie
  })

  function putRequest(capabilities: unknown) {
    return new Request('http://localhost', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities }),
    })
  }

  it('a non-super_admin actor (hr_admin) gets 403 attempting to set an override, even for a role that is not itself super_admin', async () => {
    const res = await withSession(hrAdminCookie, () =>
      putOverride(putRequest(['inventory.stock.view']), { params: Promise.resolve({ role: 'branch_manager' }) })
    )
    expect(res.status).toBe(403)
  })

  it('super_admin can set an override for branch_manager, and it is persisted with complete-replacement semantics', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['accounting.pnl.view']), { params: Promise.resolve({ role: 'branch_manager' }) })
    )
    expect(res.status).toBe(200)
    const doc = await getAdminFirestore().collection('roleCapabilityOverrides').doc('branch_manager').get()
    expect(doc.data()!.capabilities).toEqual(['accounting.pnl.view'])
    expect(doc.data()!.updatedBy).toBe(superAdminUid)
  })

  it('writes a role_capability_override_change audit entry with before/after', async () => {
    const snap = await getAdminFirestore()
      .collection('auditLogs')
      .where('action', '==', 'role_capability_override_change')
      .where('targetUid', '==', null)
      .get()
    // targetUid is null (this targets a ROLE, not a specific staff uid) —
    // find the entry by actor + details.role instead.
    const entry = snap.docs.find((d) => d.data().details?.role === 'branch_manager')
    expect(entry).toBeTruthy()
    expect(entry!.data().details.after).toEqual(['accounting.pnl.view'])
  })

  it('rejects attempting to set an override for super_admin itself, even by a real super_admin actor', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['inventory.stock.view']), { params: Promise.resolve({ role: 'super_admin' }) })
    )
    expect(res.status).toBe(400)
    const doc = await getAdminFirestore().collection('roleCapabilityOverrides').doc('super_admin').get()
    expect(doc.exists).toBe(false)
  })

  it('rejects an override that includes admin.roleOverrides.manage', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['admin.roleOverrides.manage']), { params: Promise.resolve({ role: 'hr_admin' }) })
    )
    expect(res.status).toBe(400)
  })

  it('rejects a request body with a non-array or unknown capability string', async () => {
    const res1 = await withSession(superAdminCookie, () =>
      putOverride(putRequest('not-an-array'), { params: Promise.resolve({ role: 'hr_admin' }) })
    )
    expect(res1.status).toBe(400)
    const res2 = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['not.a.real.capability']), { params: Promise.resolve({ role: 'hr_admin' }) })
    )
    expect(res2.status).toBe(400)
  })

  it('DELETE reverts branch_manager to the hardcoded default and writes an audit entry with after: null', async () => {
    const res = await withSession(superAdminCookie, () =>
      deleteOverride(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ role: 'branch_manager' }) })
    )
    expect(res.status).toBe(200)
    const doc = await getAdminFirestore().collection('roleCapabilityOverrides').doc('branch_manager').get()
    expect(doc.exists).toBe(false)
    const snap = await getAdminFirestore().collection('auditLogs').where('action', '==', 'role_capability_override_change').get()
    const revertEntry = snap.docs.find((d) => d.data().details?.role === 'branch_manager' && d.data().details?.after === null)
    expect(revertEntry).toBeTruthy()
  })

  it('DELETE on a role with no existing override is a harmless no-op, still 200', async () => {
    const res = await withSession(superAdminCookie, () =>
      deleteOverride(new Request('http://localhost', { method: 'DELETE' }), { params: Promise.resolve({ role: 'it_admin' }) })
    )
    expect(res.status).toBe(200)
  })

  it('rejects an invalid role param that is not one of the fourteen real roles', async () => {
    const res = await withSession(superAdminCookie, () =>
      putOverride(putRequest(['inventory.stock.view']), { params: Promise.resolve({ role: 'not_a_real_role' }) })
    )
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test -- roleCapabilityOverrides
```

Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 4: Implement the route**

Create `src/app/api/role-capability-overrides/[role]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { ROLES, ROLE_CAPABILITIES, type RoleId, type Capability } from '@/lib/auth/permissions'
import { validateRoleCapabilityOverride } from '@/lib/auth/roleOverrideValidation'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getAllRoleOverrides } from '@/lib/auth/roleOverrides'
import { writeAuditLog } from '@/lib/audit/log'

function isRoleId(value: string): value is RoleId {
  return (ROLES as readonly string[]).includes(value)
}

export async function PUT(request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role: roleParam } = await params
  try {
    const user = await requireCapability('admin.roleOverrides.manage')

    if (!isRoleId(roleParam)) {
      return NextResponse.json({ error: 'Not a real role' }, { status: 400 })
    }
    const role = roleParam

    const body = await request.json()
    if (!Array.isArray(body.capabilities) || !body.capabilities.every((c: unknown) => typeof c === 'string' && c in ROLE_CAPABILITIES)) {
      return NextResponse.json({ error: 'capabilities must be an array of known capability strings' }, { status: 400 })
    }
    const newCapabilities = body.capabilities as Capability[]

    const currentOverrides = await getAllRoleOverrides()
    const validationError = validateRoleCapabilityOverride(role, newCapabilities, currentOverrides)
    if (validationError) {
      return NextResponse.json({ error: validationError.message, reason: validationError.reason }, { status: 400 })
    }

    const before = currentOverrides[role] ?? null

    const db = getAdminFirestore()
    await db.collection('roleCapabilityOverrides').doc(role).set({
      role,
      capabilities: newCapabilities,
      updatedAt: new Date(),
      updatedBy: user.uid,
    })

    await writeAuditLog({
      action: 'role_capability_override_change',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: null,
      details: { role, before, after: newCapabilities },
    })

    return NextResponse.json({ ok: true, role, capabilities: newCapabilities })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role: roleParam } = await params
  try {
    const user = await requireCapability('admin.roleOverrides.manage')

    if (!isRoleId(roleParam)) {
      return NextResponse.json({ error: 'Not a real role' }, { status: 400 })
    }
    const role = roleParam
    if (role === 'super_admin') {
      return NextResponse.json({ error: "super_admin's capabilities cannot be edited through this mechanism." }, { status: 400 })
    }

    const db = getAdminFirestore()
    const docRef = db.collection('roleCapabilityOverrides').doc(role)
    const existing = await docRef.get()
    const before = existing.exists ? (existing.data()!.capabilities as Capability[]) : null

    if (existing.exists) {
      await docRef.delete()
    }

    await writeAuditLog({
      action: 'role_capability_override_change',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: null,
      details: { role, before, after: null },
    })

    return NextResponse.json({ ok: true, role, capabilities: null })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

Note: the `PUT` handler's validation order deliberately checks `role === 'super_admin'` via `validateRoleCapabilityOverride` (called after the role-param/body-shape checks) rather than a separate early check — `isRoleId('super_admin')` is `true` (it's a real role), so the flow reaches `validateRoleCapabilityOverride('super_admin', ...)`, which returns the `super_admin_immutable` error. The `DELETE` handler has no validation function to call (there's nothing to validate about a deletion body), so it checks `role === 'super_admin'` directly and explicitly.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- roleCapabilityOverrides
```

Expected: PASS, all 9 cases.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 7: Typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/role-capability-overrides src/lib/types/audit.ts tests/integration/roleCapabilityOverrides.test.ts
git commit -m "feat(auth): add PUT/DELETE /api/role-capability-overrides/[role], audit-logged, guardrail-validated"
```

- [ ] **Step 9: Flag for Opus-tier review** — this is the write path for the highest-leverage capability-adjacent action in the system.

---

### Task 6: UI — extend the Roles page with an editable capability matrix for `super_admin`

**Files:**
- Modify: `src/app/(dashboard)/roles/page.tsx`
- Modify: `src/components/roles/RoleMatrix.tsx`
- Create: `src/components/roles/RoleCapabilityEditor.tsx`

**Interfaces:**
- Consumes: `getAllRoleOverrides` (Task 2), `PUT`/`DELETE /api/role-capability-overrides/[role]` (Task 5), `hasEffectiveCapability` (Task 1).
- Produces: nothing consumed elsewhere — this is the leaf UI.

- [ ] **Step 1: Resolve effective capabilities server-side in `RolesPage` and pass them down**

In `src/app/(dashboard)/roles/page.tsx`, add the import and resolve overrides alongside the existing staff query:

```ts
import { getAllRoleOverrides } from '@/lib/auth/roleOverrides'
import { hasEffectiveCapability } from '@/lib/auth/permissions'
```

After the existing `const canAssign = hasCapability(user.role, 'admin.roles.assign')` line — change that line itself to use the new function (it's already covered by Task 3's sweep if this file was in the list above; confirm it was — yes, entry 1 — so by the time this task runs, that line already reads `hasEffectiveCapability(user, 'admin.roles.assign')`). Add:

```ts
  const canManageOverrides = hasEffectiveCapability(user, 'admin.roleOverrides.manage')
  const overrides = canManageOverrides ? await getAllRoleOverrides() : {}
```

Pass to `RoleMatrix`:

```tsx
        <RoleMatrix overrides={overrides} canEdit={canManageOverrides} />
```

- [ ] **Step 2: Make `RoleMatrix.tsx` override-aware and add the edit affordance**

Read the current file first (it's a pure server-rendered table today, no props). Change its signature and the per-role capability computation to use the passed-in overrides instead of only the static default, and — for non-`super_admin` rows, when `canEdit` is true — render an "Edit" trigger that mounts `RoleCapabilityEditor` for that row instead of the static checkmark row.

```tsx
import { ROLES, ROLE_CAPABILITIES, type Capability, type RoleId } from '@/lib/auth/permissions'
import RoleCapabilityEditor from './RoleCapabilityEditor'

const CAPABILITIES = Object.keys(ROLE_CAPABILITIES) as Capability[]

export default function RoleMatrix({
  overrides,
  canEdit,
}: {
  overrides: Partial<Record<RoleId, Capability[]>>
  canEdit: boolean
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                Role
              </th>
              {CAPABILITIES.map((cap) => (
                <th
                  key={cap}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate"
                >
                  {cap}
                </th>
              ))}
              {canEdit && (
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  Override
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {ROLES.map((role) => {
              if (role === 'super_admin') {
                return (
                  <tr key={role} className="bg-mist/40">
                    <td className="px-3 py-2 font-medium text-ink">{role}</td>
                    <td colSpan={CAPABILITIES.length + (canEdit ? 1 : 0)} className="px-3 py-2 italic text-slate">
                      (full access, protected)
                    </td>
                  </tr>
                )
              }
              const override = overrides[role] ?? null
              const effective = override ?? CAPABILITIES.filter((cap) => ROLE_CAPABILITIES[cap].includes(role))
              return (
                <tr key={role} className="transition-colors duration-200 hover:bg-mist/40">
                  <td className="px-3 py-2 font-medium text-ink">
                    {role}
                    {override && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">overridden</span>}
                  </td>
                  {CAPABILITIES.map((cap) => {
                    const granted = effective.includes(cap)
                    return (
                      <td key={cap} className="px-3 py-2 text-center">
                        {granted ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/10 text-success">
                            <span aria-hidden="true">✓</span>
                            <span className="sr-only">Granted</span>
                          </span>
                        ) : (
                          <span aria-hidden="true" className="text-slate">
                            —
                          </span>
                        )}
                      </td>
                    )
                  })}
                  {canEdit && (
                    <td className="px-3 py-2">
                      <RoleCapabilityEditor role={role} capabilities={CAPABILITIES} effectiveCapabilities={effective} hasOverride={!!override} />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the client-side editor component**

Create `src/components/roles/RoleCapabilityEditor.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Capability, RoleId } from '@/lib/auth/permissions'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'

export default function RoleCapabilityEditor({
  role,
  capabilities,
  effectiveCapabilities,
  hasOverride,
}: {
  role: RoleId
  capabilities: Capability[]
  effectiveCapabilities: Capability[]
  hasOverride: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<Capability>>(new Set(effectiveCapabilities))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(cap: Capability) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(cap)) next.delete(cap)
      else next.add(cap)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/role-capability-overrides/${role}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capabilities: Array.from(selected) }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not save')
        return
      }
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/role-capability-overrides/${role}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not reset')
        return
      }
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Edit
        </Button>
        {hasOverride && (
          <Button variant="secondary" onClick={handleReset} disabled={saving}>
            Reset to default
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-mist bg-paper p-3">
      {error && <Alert tone="error" inline>{error}</Alert>}
      <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <legend className="sr-only">Capabilities for {role}</legend>
        {capabilities.map((cap) => (
          <label key={cap} className="flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={selected.has(cap)}
              onChange={() => toggle(cap)}
              disabled={cap === 'admin.roleOverrides.manage'}
              className="h-4 w-4"
            />
            {cap}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} loading={saving}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => { setOpen(false); setSelected(new Set(effectiveCapabilities)); setError(null) }}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
```

Note: `admin.roleOverrides.manage` is rendered as a disabled, unselectable checkbox in the editor UI (defense-in-depth alongside the server-side rejection in Task 5/1 — the server is the real guardrail, this just prevents a confusing round-trip where the UI let you check it and the server then rejected the whole save).

- [ ] **Step 4: Typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: unchanged (no automated test framework for React components in this project, matching prior phases — verification is live, Task 7's job).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/roles/page.tsx" src/components/roles/RoleMatrix.tsx src/components/roles/RoleCapabilityEditor.tsx
git commit -m "feat(roles): editable capability matrix for super_admin on the Roles & Permissions page"
```

---

### Task 7: Firestore rule, full regression, and live verification

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add the closed rule for the new collection**

In `firestore.rules`, add (alongside the other fully-closed collections, e.g. after the `attachments` block):

```
    match /roleCapabilityOverrides/{role} {
      allow read, write: if false; // all access goes through /api/role-capability-overrides — see CLAUDE.md's Phase 39 section for why overrides don't extend into this file's other two hardcoded role checks (auditLogs/staff)
    }
```

- [ ] **Step 2: Deploy the rule** (requires explicit go-ahead each time per this project's standing practice for any Firestore deploy)

```bash
firebase deploy --only firestore:rules
```

- [ ] **Step 3: Run the full suite one final time**

```bash
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
npm test
```

Expected: all passing, including every test added across Tasks 1, 2, and 5.

- [ ] **Step 4: Typecheck and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): close roleCapabilityOverrides collection to all client access"
```

- [ ] **Step 6: Live-verify against real `erp-lfd` data**

Per this project's `verify` skill: mint a session cookie for the real `super_admin` account. Using the real running dev server:

1. Navigate to `/roles`. Confirm the matrix now shows an "Override" column with Edit/Reset controls for every non-`super_admin` role.
2. Pick a low-stakes role (e.g. `it_admin`), click Edit, toggle one capability off that it currently holds by default, Save. Confirm the page shows "overridden" next to that role and the checkmark grid reflects the change.
3. Mint a session cookie for a real `it_admin` account and confirm, live, that the removed capability's corresponding page/action now correctly 403s or hides the corresponding UI element — pick a concrete, checkable capability (e.g. remove `hr.attendance.view` and confirm the account can no longer reach the attendance-review view it previously could).
4. Click "Reset to default" for that role. Confirm the account's access reverts immediately (next request, no delay) — hit the same page/action again and confirm it now succeeds again.
5. Confirm, live, that `super_admin`'s own row still shows "(full access, protected)" with no edit control, and that attempting a direct `PUT /api/role-capability-overrides/super_admin` call (via `curl`/`fetch` with the super_admin's own session cookie) returns 400.
6. Query `auditLogs` directly (by `action == 'role_capability_override_change'`) and confirm real entries exist for both the set and the reset from steps 2-4, with correct `before`/`after` values.

Report the actual observed results for all six checks, not an assumption.

---

## Final whole-branch review

After all 7 tasks are individually reviewed and merged, dispatch one final whole-branch review (Opus, given this phase's own stated stakes) covering the complete diff. The review should explicitly confirm:
- `hasCapability` itself is byte-unchanged from before this phase (a `git diff` on `permissions.ts` should show only additions — the new capability, the new constant, the new `hasEffectiveCapability` function — never a modified line inside the existing `hasCapability` function body).
- Every one of the 45 call-site changes in Task 3 is a pure signature-shape swap with no logic change beyond the function name/argument.
- `super_admin` cannot have an override under any code path traced end to end — write rejection (Task 5), read-path exclusion (Task 2's `getRoleOverride`), and UI exclusion (Task 6's `RoleMatrix` special-case row).
- The self-referential escalation guard (`admin.roleOverrides.manage` can never appear in an override) is enforced server-side, not just hidden in the UI.
- The existing role×capability snapshot test (`tests/unit/permissions.test.ts`) passes with only the expected, reviewed diff (the new capability column, nothing else).
- Every override write and revert produces a real, correctly-shaped audit log entry.
