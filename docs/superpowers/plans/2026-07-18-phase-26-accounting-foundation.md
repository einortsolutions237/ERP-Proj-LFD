# Phase 26 — Accounting Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship expense tracking and a gross, pre-tax P&L report — `finance_admin`'s first substantial feature set since Phase 1, with `general_manager`/`super_admin` oversight — without building a chart of accounts, a debit/credit ledger, or any tax logic.

**Architecture:** A new `expenses` collection (fully closed in Firestore rules, Admin-SDK-only writes, no transaction needed — a plain create, no race-prone numeric field) plus a new `src/lib/reports/pnl.ts` that reuses Phase 7's `buildSalesReport` for the revenue side and sums `expenses` for the same date range: Net Income = Revenue − Expenses, gross, pre-tax. Three new capabilities follow this project's established create/view split (`crm.customer.create`/`.view`, `pos.sale.create`/`.view`).

**Tech Stack:** Next.js App Router API routes + Firestore Admin SDK — the existing stack, no new dependencies.

## Global Constraints

- No tax calculation, tax field, or tax-rate logic anywhere in this phase's output.
- No chart of accounts, no debit/credit ledger, no edit/delete route for expenses — create + view only, matching the stated data model exactly (`date`, `category`, `amount`, `description`, `branchId`, `recordedBy`, `createdAt` — no `updatedAt`).
- `expenses` fully closed in Firestore rules — no direct client read or write, same treatment as every other collection in this app.
- Reuse `buildSalesReport` (`src/lib/reports/sales.ts`) for the revenue side of the P&L, **unmodified** — Phase 20 deliberately froze that file's `role === 'branch_manager'` scoping; do not touch it.
- `finance_admin` gets create+view on expenses and view on the P&L. `general_manager`/`super_admin` get view only on both (never create). No other role gets any of the three new capabilities.
- Payroll, chart of accounts, budget tracking, and multi-currency are explicitly out of scope for this phase — flag if touched, don't build.

## Decisions made explicit up front (per the request to confirm rather than assume)

1. **P&L visibility: org-wide by default, with an optional branch filter.** `finance_admin`/`general_manager`/`super_admin` are all non-branch-locked (`BRANCH_LOCKED_ROLES` is `['branch_manager', 'cashier', 'inventory_manager']` — none of the three accounting roles are in it), so this matches the Phase 12 pattern directly: the P&L defaults to every branch combined, with an optional `?branchId=` query param (validated against a real `branches` doc, same as every other explicit-branchId-override in this system) to narrow to one branch. The branch-filtered revenue figure is read straight out of `buildSalesReport`'s own `byBranch` breakdown — no second query against `sales`.
2. **Expense creation `branchId`** defaults to the recording user's own `branchId`, with an explicit `branchId` in the request body honored only for non-branch-locked roles and validated against a real `branches` doc — the exact `POST /api/departments` pattern (`src/app/api/departments/route.ts:36-53`), reused verbatim rather than re-derived.
3. **No edit/delete route for expenses this phase.** The stated data model has no `updatedAt` field, and the exit criteria only mention recording and viewing. A correction/void flow is a reasonable near-term follow-up once `finance_admin` is actually using this — flagging it rather than silently adding scope.
4. **CLAUDE.md staleness, resolved for this plan:** the "updated md document" pasted into this conversation reverted the Firebase project ID to the retired `lfd-erp-4713b` and undercounted shipped phases (described Phase 14 as in-progress, messaging as unbuilt). It was not used as a source of truth anywhere in this plan. This plan is written against the real on-disk `CLAUDE.md` (Phase 25, tagged `phase-25-baseline`) plus the plain-English task description. CLAUDE.md gets updated at phase end with only what's confirmed by this plan and its live verification — not the pasted content.
5. **`accounting.pnl.view` maps to the `accounting` module**, not `reporting` — `MODULES`/`CAPABILITY_MODULE` in `src/lib/auth/permissions.ts` have reserved `'accounting'` since Phase 1 with the comment "no capabilities defined yet; add them here when the module is actually built." This phase is what finally uses it.

## File Structure

- `src/lib/types/expense.ts` (new) — `Expense` interface, the 7-field record.
- `src/lib/types/audit.ts` (modify) — add `'expense_create'` to `AuditAction`.
- `src/lib/auth/permissions.ts` (modify) — 3 new capabilities, 2 new role-list constants.
- `firestore.rules` (modify) — `expenses` closed match block.
- `src/lib/expenses/store.ts` (new) — `createExpense`/`queryExpenses`/`resolveExpenseBranchId` — the only Firestore access point for `expenses`.
- `src/app/api/expenses/route.ts` (new) — `POST` (create), `GET` (list).
- `src/lib/reports/pnl.ts` (new) — `buildPnLReport`, reusing `buildSalesReport`.
- `src/app/api/reports/pnl/route.ts` (new) — `GET`.
- `src/app/(dashboard)/expenses/page.tsx` (new) — list page.
- `src/app/(dashboard)/expenses/new/page.tsx` (new) — record-expense page shell.
- `src/app/(dashboard)/expenses/new/ExpenseForm.tsx` (new) — client form.
- `src/app/(dashboard)/reports/pnl/page.tsx` (new) — P&L report page, mirrors `reports/sales/page.tsx`.
- `src/components/layout/Sidebar.tsx` (modify) — 2 new nav entries + 2 new icons.
- `tests/setup/fixtures.ts` (modify) — `seedExpense` helper.
- `tests/unit/permissions.test.ts` (modify) — new capability assertions; snapshot regenerated.
- `tests/integration/expenses.test.ts` (new).
- `tests/integration/pnl.test.ts` (new).

---

### Task 1: Data model, capabilities, and Firestore rules

**Request Opus-tier review for this task** — this is the access-control foundation for money-adjacent data; treat with the same rigor this project gives any permissions change, per the explicit request to match Phase 18's care level.

**Files:**
- Create: `src/lib/types/expense.ts`
- Modify: `src/lib/types/audit.ts`
- Modify: `src/lib/auth/permissions.ts`
- Modify: `firestore.rules`
- Modify: `tests/unit/permissions.test.ts`

**Interfaces:**
- Produces: `Expense` type (`id`, `date: Timestamp`, `category: string`, `amount: number`, `description: string`, `branchId: string`, `recordedBy: string`, `createdAt: Timestamp`), three new `Capability` union members (`'accounting.expense.create' | 'accounting.expense.view' | 'accounting.pnl.view'`), `AuditAction` gains `'expense_create'`.

- [ ] **Step 1: Add the `Expense` type**

Create `src/lib/types/expense.ts`:

```ts
export interface Expense {
  id: string
  date: FirebaseFirestore.Timestamp
  category: string
  amount: number
  description: string
  branchId: string
  recordedBy: string
  createdAt: FirebaseFirestore.Timestamp
}
```

- [ ] **Step 2: Add `expense_create` to `AuditAction`**

Modify `src/lib/types/audit.ts` — add one line to the union (after `| 'message_create'`):

```ts
  | 'message_create'
  | 'expense_create'
```

- [ ] **Step 3: Add the three capabilities and their role lists**

Modify `src/lib/auth/permissions.ts`. In the `Capability` union, replace the trailing comment block:

```ts
  // accounting.* — no capabilities defined yet;
  // add them here when the module is actually built.
```

with:

```ts
  // Phase 26 — Accounting Foundation. Create is narrower than view:
  // finance_admin records expenses; general_manager/super_admin get full
  // oversight (expenses + P&L) without authoring, the same create-vs-view
  // split already established for crm.customer.create/.view and
  // pos.sale.create/.view.
  | 'accounting.expense.create'
  | 'accounting.expense.view'
  | 'accounting.pnl.view'
```

In `CAPABILITY_MODULE`, add (anywhere in the object, e.g. after `'dashboard.activity.view': 'dashboard',`):

```ts
  'accounting.expense.create': 'accounting',
  'accounting.expense.view': 'accounting',
  'accounting.pnl.view': 'accounting',
```

After the `DASHBOARD_ACTIVITY_ROLES` constant (before `INTAKE_RECORD_ROLES`), add:

```ts
// Phase 26 — Accounting Foundation. finance_admin's first substantial
// feature set since Phase 1.
const ACCOUNTING_EXPENSE_CREATE_ROLES: RoleId[] = ['super_admin', 'finance_admin']
// Backs both accounting.expense.view and accounting.pnl.view by shared
// reference. Unlike the clinical-wall capabilities, there is no risk of
// this silently widening into unrelated access — both capabilities are the
// same "accounting oversight" concern for the same three roles, not two
// capabilities that only happen to currently coincide.
const ACCOUNTING_VIEW_ROLES: RoleId[] = ['super_admin', 'finance_admin', 'general_manager']
```

In `ROLE_CAPABILITIES`, add (anywhere in the object, e.g. after `'dashboard.activity.view': DASHBOARD_ACTIVITY_ROLES,`):

```ts
  'accounting.expense.create': ACCOUNTING_EXPENSE_CREATE_ROLES,
  'accounting.expense.view': ACCOUNTING_VIEW_ROLES,
  'accounting.pnl.view': ACCOUNTING_VIEW_ROLES,
```

- [ ] **Step 4: Close the `expenses` collection in Firestore rules**

Modify `firestore.rules` — add before the final `match /{document=**}` block (after the `intakeQuestionnaire` block):

```
    match /expenses/{expenseId} {
      allow read, write: if false; // all access goes through /api/expenses — financial record-keeping data, same fully-closed treatment as every other collection in this app
    }
```

- [ ] **Step 5: Add capability assertions to the permissions test**

Modify `tests/unit/permissions.test.ts` — add inside the `describe('role x capability matrix', ...)` block, after the last existing `it(...)`:

```ts
  it('accounting.expense.create is exactly [super_admin, finance_admin]', () => {
    expect(ROLE_CAPABILITIES['accounting.expense.create'].slice().sort()).toEqual(['finance_admin', 'super_admin'])
  })

  it('accounting.expense.view and accounting.pnl.view are both exactly [super_admin, finance_admin, general_manager]', () => {
    expect(ROLE_CAPABILITIES['accounting.expense.view'].slice().sort()).toEqual(['finance_admin', 'general_manager', 'super_admin'])
    expect(ROLE_CAPABILITIES['accounting.pnl.view'].slice().sort()).toEqual(['finance_admin', 'general_manager', 'super_admin'])
  })

  it('general_manager can view expenses/P&L but cannot record an expense', () => {
    expect(hasCapability('general_manager', 'accounting.expense.view')).toBe(true)
    expect(hasCapability('general_manager', 'accounting.pnl.view')).toBe(true)
    expect(hasCapability('general_manager', 'accounting.expense.create')).toBe(false)
  })

  it('no non-accounting role holds any of the three accounting capabilities', () => {
    const excluded: RoleId[] = ['admin', 'branch_manager', 'cashier', 'hr_admin', 'it_admin', 'doctor', 'medical_secretary', 'protocol', 'nurse', 'lab_staff', 'inventory_manager']
    for (const role of excluded) {
      expect(hasCapability(role, 'accounting.expense.create')).toBe(false)
      expect(hasCapability(role, 'accounting.expense.view')).toBe(false)
      expect(hasCapability(role, 'accounting.pnl.view')).toBe(false)
    }
  })
```

- [ ] **Step 6: Run the permissions test, regenerate the snapshot**

Run: `npm test -- tests/unit/permissions.test.ts -u`
Expected: all tests pass; the `matches the exact grant table for every role x every capability` snapshot is rewritten to include the 3 new capability columns (this is the correct, expected update — verify by eye that only the 3 new columns appear as new keys per role, nothing else changed).

Run again without `-u` to confirm the new snapshot is now stable: `npm test -- tests/unit/permissions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types/expense.ts src/lib/types/audit.ts src/lib/auth/permissions.ts firestore.rules tests/unit/permissions.test.ts tests/unit/__snapshots__
git commit -m "feat: accounting capabilities, expenses collection rules, Expense type"
```

---

### Task 2: Expense recording — store + API routes

**Request Opus-tier review for this task** — the branch-derivation logic on a money-adjacent write path.

**Files:**
- Create: `src/lib/expenses/store.ts`
- Create: `src/app/api/expenses/route.ts`
- Modify: `tests/setup/fixtures.ts`
- Create: `tests/integration/expenses.test.ts`

**Interfaces:**
- Consumes: `SessionUser` (`src/lib/auth/server-guard.ts`), `isBranchLocked` (`src/lib/auth/permissions.ts`), `writeAuditLog` (`src/lib/audit/log.ts`), `Expense` (`src/lib/types/expense.ts`).
- Produces: `createExpense(user, input): Promise<{ id: string; payload: Record<string, unknown> }>`, `queryExpenses(user): Promise<Expense[]>`, `resolveExpenseBranchId(user, requestedBranchId): Promise<string>`, `ExpenseValidationError`.

- [ ] **Step 1: Write the expense store**

Create `src/lib/expenses/store.ts`:

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import type { Expense } from '@/lib/types/expense'

export class ExpenseValidationError extends Error {}

export interface CreateExpenseInput {
  date: string // 'YYYY-MM-DD'
  category: string
  amount: number
  description: string
  branchId?: string | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Mirrors POST /api/departments' branchId resolution exactly: a
// branch-locked role's own branchId is used unconditionally; a
// non-branch-locked role may target any real branch, validated against a
// live branches doc.
export async function resolveExpenseBranchId(user: SessionUser, requestedBranchId: unknown): Promise<string> {
  if (isBranchLocked(user.role)) return user.branchId
  if (requestedBranchId === undefined || requestedBranchId === null) return user.branchId
  if (!isNonEmptyString(requestedBranchId)) {
    throw new ExpenseValidationError('branchId must be a non-empty string')
  }
  const db = getAdminFirestore()
  const branchSnap = await db.collection('branches').doc(requestedBranchId.trim()).get()
  if (!branchSnap.exists) {
    throw new ExpenseValidationError('branchId does not reference an existing branch')
  }
  return requestedBranchId.trim()
}

export async function createExpense(
  user: SessionUser,
  input: CreateExpenseInput
): Promise<{ id: string; payload: Record<string, unknown> }> {
  if (!isNonEmptyString(input.date) || isNaN(new Date(`${input.date}T00:00:00.000Z`).getTime())) {
    throw new ExpenseValidationError('date must be a valid date (YYYY-MM-DD)')
  }
  if (!isNonEmptyString(input.category)) {
    throw new ExpenseValidationError('category is required')
  }
  if (typeof input.amount !== 'number' || !isFinite(input.amount) || input.amount <= 0) {
    throw new ExpenseValidationError('amount must be a positive number')
  }
  if (!isNonEmptyString(input.description)) {
    throw new ExpenseValidationError('description is required')
  }

  const branchId = await resolveExpenseBranchId(user, input.branchId)

  const db = getAdminFirestore()
  const ref = db.collection('expenses').doc()
  const payload = {
    date: new Date(`${input.date}T00:00:00.000Z`),
    category: input.category.trim(),
    amount: input.amount,
    description: input.description.trim(),
    branchId,
    recordedBy: user.uid,
    createdAt: new Date(),
  }
  await ref.set(payload)
  return { id: ref.id, payload }
}

// No orderBy in the Firestore query — combining the branchId equality
// filter with orderBy('date') on a different field would need a new
// composite index. Sorted in memory instead, same reasoning as avoiding an
// unnecessary index for a collection this small.
export async function queryExpenses(user: SessionUser): Promise<Expense[]> {
  const db = getAdminFirestore()
  const collection = db.collection('expenses')
  const snap = isBranchLocked(user.role)
    ? await collection.where('branchId', '==', user.branchId).get()
    : await collection.get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Expense))
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())
}
```

- [ ] **Step 2: Write the API routes**

Create `src/app/api/expenses/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { createExpense, queryExpenses, ExpenseValidationError } from '@/lib/expenses/store'

export async function GET() {
  try {
    const user = await requireCapability('accounting.expense.view')
    const expenses = await queryExpenses(user)
    return NextResponse.json(expenses)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('accounting.expense.create')
    const body = await request.json()

    let result
    try {
      result = await createExpense(user, {
        date: body.date,
        category: body.category,
        amount: body.amount,
        description: body.description,
        branchId: body.branchId,
      })
    } catch (err) {
      if (err instanceof ExpenseValidationError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }

    await writeAuditLog({
      action: 'expense_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: result.id,
      branchId: result.payload.branchId as string,
      details: result.payload,
    })

    return NextResponse.json({ id: result.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
```

- [ ] **Step 3: Add a `seedExpense` fixture**

Modify `tests/setup/fixtures.ts` — add at the end of the file:

```ts
export async function seedExpense(input: { branchId: string; date: Date; category: string; amount: number; description?: string; recordedBy?: string }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('expenses').doc()
  await ref.set({
    date: input.date,
    category: input.category,
    amount: input.amount,
    description: input.description ?? 'Test expense',
    branchId: input.branchId,
    recordedBy: input.recordedBy ?? 'test-finance-admin',
    createdAt: new Date(),
  })
  return { id: ref.id }
}
```

- [ ] **Step 4: Write the integration test**

Create `tests/integration/expenses.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { POST as postExpense, GET as getExpenses } from '@/app/api/expenses/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff } from '../setup/fixtures'

describe('POST /api/expenses and GET /api/expenses', () => {
  let branchA: string
  let branchB: string
  let financeAdminCookie: string
  let generalManagerCookie: string
  let superAdminCookie: string
  let cashierCookie: string
  let adminCookie: string

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Expenses Test Branch A')
    const b = await seedBranch('Expenses Test Branch B')
    branchA = a.id
    branchB = b.id
    financeAdminCookie = (await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-exp@test.local' })).sessionCookie
    generalManagerCookie = (await seedStaff({ role: 'general_manager', branchId: branchA, email: 'gm-exp@test.local' })).sessionCookie
    superAdminCookie = (await seedStaff({ role: 'super_admin', branchId: branchA, email: 'sa-exp@test.local' })).sessionCookie
    cashierCookie = (await seedStaff({ role: 'cashier', branchId: branchA, email: 'cash-exp@test.local' })).sessionCookie
    adminCookie = (await seedStaff({ role: 'admin', branchId: branchA, email: 'admin-exp@test.local' })).sessionCookie
  })

  function expenseRequest(body: unknown) {
    return new Request('http://localhost/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('finance_admin can record an expense, defaulting branchId to their own branch', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 500, description: 'July rent' }))
    )
    expect(res.status).toBe(201)
    const body = await res.json()

    const doc = await getAdminFirestore().collection('expenses').doc(body.id).get()
    expect(doc.data()!.branchId).toBe(branchA)
    expect(doc.data()!.amount).toBe(500)
    expect(doc.data()!.category).toBe('Rent')
    expect(doc.data()!.recordedBy).toBeTruthy()

    const auditSnap = await getAdminFirestore().collection('auditLogs').where('action', '==', 'expense_create').where('targetUid', '==', body.id).get()
    expect(auditSnap.empty).toBe(false)
    expect(auditSnap.docs[0].data().details.amount).toBe(500)
  })

  it('finance_admin can explicitly target a different real branch', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Utilities', amount: 200, description: 'Water bill', branchId: branchB }))
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    const doc = await getAdminFirestore().collection('expenses').doc(body.id).get()
    expect(doc.data()!.branchId).toBe(branchB)
  })

  it('rejects a non-existent branchId', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 100, description: 'x', branchId: 'not-a-real-branch' }))
    )
    expect(res.status).toBe(400)
  })

  it('rejects a non-positive amount', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 0, description: 'x' }))
    )
    expect(res.status).toBe(400)
  })

  it('rejects an invalid date', async () => {
    const res = await withSession(financeAdminCookie, () =>
      postExpense(expenseRequest({ date: 'not-a-date', category: 'Rent', amount: 100, description: 'x' }))
    )
    expect(res.status).toBe(400)
  })

  it('general_manager and super_admin can view but not create; cashier/admin get 403 on both', async () => {
    const resGmCreate = await withSession(generalManagerCookie, () =>
      postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 100, description: 'x' }))
    )
    expect(resGmCreate.status).toBe(403)

    const resGmView = await withSession(generalManagerCookie, () => getExpenses())
    expect(resGmView.status).toBe(200)

    const resSaView = await withSession(superAdminCookie, () => getExpenses())
    expect(resSaView.status).toBe(200)

    for (const cookie of [cashierCookie, adminCookie]) {
      const resCreate = await withSession(cookie, () =>
        postExpense(expenseRequest({ date: '2026-07-15', category: 'Rent', amount: 100, description: 'x' }))
      )
      expect(resCreate.status).toBe(403)
      const resView = await withSession(cookie, () => getExpenses())
      expect(resView.status).toBe(403)
    }
  })

  it('GET /api/expenses is org-wide for finance_admin (sees both seeded branches)', async () => {
    const res = await withSession(financeAdminCookie, () => getExpenses())
    expect(res.status).toBe(200)
    const rows = await res.json()
    const branchesSeen = new Set(rows.map((r: { branchId: string }) => r.branchId))
    expect(branchesSeen.has(branchA)).toBe(true)
    expect(branchesSeen.has(branchB)).toBe(true)
  })
})
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- tests/integration/expenses.test.ts`
Expected: PASS, all 7 tests. If Firestore reports a missing-index error on `GET /api/expenses` or the create path, the error message includes a direct console link to create it — this is not expected for this query shape (equality-only, no orderBy), but if it occurs, follow the link, add the resulting entry to `firestore.indexes.json`, and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/lib/expenses/store.ts src/app/api/expenses/route.ts tests/setup/fixtures.ts tests/integration/expenses.test.ts
git commit -m "feat: expense recording (POST/GET /api/expenses)"
```

---

### Task 3: P&L report builder — reuses Phase 7 revenue logic

**Request Opus-tier review for this task** — this is the exit-criterion-critical piece: the revenue figure must match Phase 7's existing report by construction, not by a second recomputation that could drift from it.

**Files:**
- Create: `src/lib/reports/pnl.ts`
- Create: `src/app/api/reports/pnl/route.ts`
- Create: `tests/integration/pnl.test.ts`

**Interfaces:**
- Consumes: `buildSalesReport`, `ReportValidationError` (`src/lib/reports/sales.ts`, unmodified), `isBranchLocked` (`src/lib/auth/permissions.ts`), `Expense` (`src/lib/types/expense.ts`).
- Produces: `buildPnLReport(user, startParam, endParam, branchIdParam): Promise<PnLReport>`, `PnLValidationError`, `PnLReport` interface (`range`, `branchId`, `revenueTotal`, `expenseTotal`, `netIncome`, `expensesByCategory`).

- [ ] **Step 1: Write the P&L builder**

Create `src/lib/reports/pnl.ts`:

```ts
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import { buildSalesReport, ReportValidationError } from './sales'
import type { Expense } from '@/lib/types/expense'

export { ReportValidationError }

export class PnLValidationError extends Error {}

export interface PnLReport {
  range: { start: string; end: string }
  branchId: string | null
  revenueTotal: number
  expenseTotal: number
  netIncome: number
  expensesByCategory: Array<{ category: string; amount: number }>
}

async function resolvePnLBranchFilter(user: SessionUser, branchIdParam: string | null): Promise<string | null> {
  // A branch-locked caller is always pinned to their own branch, param
  // ignored. No accounting role is branch-locked today, but this stays
  // correct if that ever changes — same reasoning as every other
  // isBranchLocked call site in this codebase.
  if (isBranchLocked(user.role)) return user.branchId
  if (!branchIdParam) return null // no filter requested: org-wide
  const db = getAdminFirestore()
  const branchSnap = await db.collection('branches').doc(branchIdParam).get()
  if (!branchSnap.exists) throw new PnLValidationError('branchId does not reference an existing branch')
  return branchIdParam
}

export async function buildPnLReport(
  user: SessionUser,
  startParam: string | null,
  endParam: string | null,
  branchIdParam: string | null
): Promise<PnLReport> {
  // Revenue side: reuse Phase 7's buildSalesReport verbatim, never
  // recomputed from scratch — this is what guarantees the P&L's revenue
  // figure matches /reports/sales for the same range, by construction, not
  // by two independent implementations happening to agree.
  const salesReport = await buildSalesReport(user, startParam, endParam)
  const branchId = await resolvePnLBranchFilter(user, branchIdParam)

  const revenueTotal = branchId
    ? salesReport.byBranch.find((b) => b.branchId === branchId)?.revenue ?? 0
    : salesReport.revenueTotal

  // Same range boundaries buildSalesReport itself already validated and
  // used, parsed back out of its own returned ISO strings rather than
  // re-implementing date parsing/validation a second time in this file.
  const start = new Date(salesReport.range.start)
  const end = new Date(salesReport.range.end)

  const db = getAdminFirestore()
  let query: FirebaseFirestore.Query = db.collection('expenses').where('date', '>=', start).where('date', '<=', end)
  if (branchId) query = query.where('branchId', '==', branchId)
  const snap = await query.get()

  let expenseTotal = 0
  const byCategory = new Map<string, number>()
  for (const doc of snap.docs) {
    const expense = doc.data() as Expense
    expenseTotal += expense.amount
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount)
  }

  const expensesByCategory = Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  return {
    range: salesReport.range,
    branchId,
    revenueTotal,
    expenseTotal,
    netIncome: revenueTotal - expenseTotal,
    expensesByCategory,
  }
}
```

- [ ] **Step 2: Write the API route**

Create `src/app/api/reports/pnl/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildPnLReport, ReportValidationError, PnLValidationError } from '@/lib/reports/pnl'

export async function GET(request: Request) {
  try {
    const user = await requireCapability('accounting.pnl.view')
    const { searchParams } = new URL(request.url)
    const report = await buildPnLReport(
      user,
      searchParams.get('startDate'),
      searchParams.get('endDate'),
      searchParams.get('branchId')
    )
    return NextResponse.json(report)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof ReportValidationError || err instanceof PnLValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
```

- [ ] **Step 3: Write the integration test**

Create `tests/integration/pnl.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

import { GET as getPnl } from '@/app/api/reports/pnl/route'
import { buildSalesReport } from '@/lib/reports/sales'
import { resetEmulator, seedBranch, seedStaff, seedSale, seedExpense } from '../setup/fixtures'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('P&L report', () => {
  let branchA: string
  let branchB: string
  let financeAdminUser: SessionUser
  let financeAdminCookie: string
  let cashierCookie: string
  let adminCookie: string
  let branchManagerCookie: string

  const inRange = new Date('2026-01-15T12:00:00.000Z')
  const outOfRange = new Date('2025-12-01T12:00:00.000Z')

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('PnL Test Branch A')
    const b = await seedBranch('PnL Test Branch B')
    branchA = a.id
    branchB = b.id

    const fa = await seedStaff({ role: 'finance_admin', branchId: branchA, email: 'fa-pnl@test.local' })
    financeAdminCookie = fa.sessionCookie
    financeAdminUser = { uid: fa.uid, email: 'fa-pnl@test.local', role: 'finance_admin', branchId: branchA }
    cashierCookie = (await seedStaff({ role: 'cashier', branchId: branchA, email: 'cash-pnl@test.local' })).sessionCookie
    adminCookie = (await seedStaff({ role: 'admin', branchId: branchA, email: 'admin-pnl@test.local' })).sessionCookie
    branchManagerCookie = (await seedStaff({ role: 'branch_manager', branchId: branchA, email: 'bm-pnl@test.local' })).sessionCookie

    await seedSale({ branchId: branchA, total: 1000, createdAt: inRange })
    await seedSale({ branchId: branchA, total: 500, createdAt: inRange })
    await seedSale({ branchId: branchA, total: 9999, createdAt: inRange, voidedAt: inRange })
    await seedSale({ branchId: branchA, total: 7777, createdAt: outOfRange })
    await seedSale({ branchId: branchB, total: 300, createdAt: inRange })

    await seedExpense({ branchId: branchA, date: new Date('2026-01-15T00:00:00.000Z'), category: 'Rent', amount: 300 })
    await seedExpense({ branchId: branchA, date: new Date('2026-01-15T00:00:00.000Z'), category: 'Utilities', amount: 150 })
    await seedExpense({ branchId: branchA, date: outOfRange, category: 'Rent', amount: 999 })
    await seedExpense({ branchId: branchB, date: new Date('2026-01-15T00:00:00.000Z'), category: 'Rent', amount: 50 })
  })

  function pnlRequest(query: string) {
    return new Request(`http://localhost/api/reports/pnl${query}`)
  }

  it('combines revenue (matching buildSalesReport exactly for the same branch/range) with expenses to compute net income', async () => {
    const res = await withSession(financeAdminCookie, () =>
      getPnl(pnlRequest(`?startDate=2026-01-10&endDate=2026-01-20&branchId=${branchA}`))
    )
    expect(res.status).toBe(200)
    const pnl = await res.json()

    expect(pnl.revenueTotal).toBe(1500) // 1000 + 500; voided 9999 and out-of-range 7777 excluded
    expect(pnl.expenseTotal).toBe(450) // 300 + 150; out-of-range 999 excluded
    expect(pnl.netIncome).toBe(1050)
    const rentRow = pnl.expensesByCategory.find((c: { category: string }) => c.category === 'Rent')
    const utilitiesRow = pnl.expensesByCategory.find((c: { category: string }) => c.category === 'Utilities')
    expect(rentRow.amount).toBe(300)
    expect(utilitiesRow.amount).toBe(150)

    // The exit criterion, checked literally: the same figure buildSalesReport
    // itself produces for this branch and range, not a separate
    // recomputation that could drift from it.
    const salesReport = await buildSalesReport(financeAdminUser, '2026-01-10', '2026-01-20')
    const branchARow = salesReport.byBranch.find((b) => b.branchId === branchA)
    expect(pnl.revenueTotal).toBe(branchARow!.revenue)
  })

  it('is org-wide when no branchId filter is given', async () => {
    const res = await withSession(financeAdminCookie, () =>
      getPnl(pnlRequest('?startDate=2026-01-10&endDate=2026-01-20'))
    )
    expect(res.status).toBe(200)
    const pnl = await res.json()
    // Independent >= bounds, not exact equality — this suite shares one
    // actively-mutating emulator across concurrently-run test files (see
    // CLAUDE.md's Phase 23 process note); branch A + B's known contribution
    // is a safe lower bound regardless of what else is running.
    expect(pnl.revenueTotal).toBeGreaterThanOrEqual(1800) // branchA's 1500 + branchB's 300
    expect(pnl.expenseTotal).toBeGreaterThanOrEqual(500) // branchA's 450 + branchB's 50
    expect(pnl.branchId).toBeNull()
  })

  it('rejects a non-existent branchId filter', async () => {
    const res = await withSession(financeAdminCookie, () =>
      getPnl(pnlRequest('?startDate=2026-01-10&endDate=2026-01-20&branchId=not-a-real-branch'))
    )
    expect(res.status).toBe(400)
  })

  it('cashier, admin, and branch_manager all get 403', async () => {
    for (const cookie of [cashierCookie, adminCookie, branchManagerCookie]) {
      const res = await withSession(cookie, () => getPnl(pnlRequest('?startDate=2026-01-10&endDate=2026-01-20')))
      expect(res.status).toBe(403)
    }
  })
})
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- tests/integration/pnl.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/pnl.ts src/app/api/reports/pnl/route.ts tests/integration/pnl.test.ts
git commit -m "feat: P&L report reusing Phase 7 revenue-reporting logic"
```

---

### Task 4: Expenses UI — list + record-expense form

**Files:**
- Create: `src/app/(dashboard)/expenses/page.tsx`
- Create: `src/app/(dashboard)/expenses/new/page.tsx`
- Create: `src/app/(dashboard)/expenses/new/ExpenseForm.tsx`

**Interfaces:**
- Consumes: `requireCapability`/`AuthError` (`src/lib/auth/server-guard.ts`), `hasCapability` (`src/lib/auth/permissions.ts`), `queryExpenses` (`src/lib/expenses/store.ts`).

- [ ] **Step 1: Write the expenses list page**

Create `src/app/(dashboard)/expenses/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { queryExpenses } from '@/lib/expenses/store'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'

export default async function ExpensesPage() {
  let user
  try {
    user = await requireCapability('accounting.expense.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const expenses = await queryExpenses(user)

  const db = getAdminFirestore()
  const branchesSnap = await db.collection('branches').get()
  const branchNameById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))

  const recorderUids = Array.from(new Set(expenses.map((e) => e.recordedBy)))
  const staffDocs = await Promise.all(recorderUids.map((uid) => db.collection('staff').doc(uid).get()))
  const emailByUid = new Map(staffDocs.filter((d) => d.exists).map((d) => [d.id, d.data()!.email as string]))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Expenses</h1>
        {hasCapability(user.role, 'accounting.expense.create') && (
          <Link href="/expenses/new" className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50">
            Record expense
          </Link>
        )}
      </div>
      {expenses.length === 0 ? (
        <p className="text-sm text-slate">No expenses recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Category</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Recorded by</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{expense.date.toDate().toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-ink">{expense.category}</td>
                  <td className="px-3 py-2 text-ink">{expense.description}</td>
                  <td className="px-3 py-2 text-ink">{branchNameById.get(expense.branchId) ?? expense.branchId}</td>
                  <td className="px-3 py-2 text-ink">{emailByUid.get(expense.recordedBy) ?? expense.recordedBy}</td>
                  <td className="px-3 py-2 font-mono text-right text-ink">{expense.amount.toFixed(2)}</td>
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

- [ ] **Step 2: Write the record-expense form**

Create `src/app/(dashboard)/expenses/new/ExpenseForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORY_SUGGESTIONS = ['Rent', 'Utilities', 'Supplies', 'Salaries', 'Other']

export default function ExpenseForm() {
  const router = useRouter()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = { date, category, amount: Number(amount), description }

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      router.push('/expenses')
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Date</label>
        <input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Category</label>
        <input
          required
          list="expense-category-suggestions"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
        <datalist id="expense-category-suggestions">
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Amount</label>
        <input
          required
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Description</label>
        <textarea
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        Record expense
      </button>
    </form>
  )
}
```

Create `src/app/(dashboard)/expenses/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import ExpenseForm from './ExpenseForm'

export default async function NewExpensePage() {
  try {
    await requireCapability('accounting.expense.create')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Record expense</h1>
      <ExpenseForm />
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/expenses"
git commit -m "feat: expenses list and record-expense form pages"
```

---

### Task 5: P&L report UI page

**Files:**
- Create: `src/app/(dashboard)/reports/pnl/page.tsx`

**Interfaces:**
- Consumes: `buildPnLReport`/`ReportValidationError`/`PnLValidationError` (`src/lib/reports/pnl.ts`), `isBranchLocked` (`src/lib/auth/permissions.ts`).

- [ ] **Step 1: Write the P&L report page**

Create `src/app/(dashboard)/reports/pnl/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildPnLReport, ReportValidationError, PnLValidationError } from '@/lib/reports/pnl'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { isBranchLocked } from '@/lib/auth/permissions'

export default async function PnLReportPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; branchId?: string }>
}) {
  const { startDate: startParam, endDate: endParam, branchId: branchIdParam } = await searchParams

  let user
  try {
    user = await requireCapability('accounting.pnl.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  let report: Awaited<ReturnType<typeof buildPnLReport>> | null = null
  let rangeError: string | null = null
  try {
    report = await buildPnLReport(user, startParam ?? null, endParam ?? null, branchIdParam ?? null)
  } catch (err) {
    if (err instanceof ReportValidationError || err instanceof PnLValidationError) {
      rangeError = err.message
    } else {
      throw err
    }
  }

  const startValue = report ? report.range.start.slice(0, 10) : startParam ?? ''
  const endValue = report ? report.range.end.slice(0, 10) : endParam ?? ''

  const db = getAdminFirestore()
  const branchesSnap = await db.collection('branches').get()
  const branches = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Profit &amp; loss</h1>

      <form method="GET" className="flex items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-ink">Start date</label>
          <input
            type="date"
            name="startDate"
            defaultValue={startValue}
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">End date</label>
          <input
            type="date"
            name="endDate"
            defaultValue={endValue}
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
          />
        </div>
        {!isBranchLocked(user.role) && (
          <div>
            <label className="block text-sm font-medium text-ink">Branch</label>
            <select
              name="branchId"
              defaultValue={branchIdParam ?? ''}
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-opacity duration-200 disabled:opacity-50">
          View
        </button>
      </form>

      {rangeError && <p className="text-sm text-danger">{rangeError}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Revenue</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.revenueTotal.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Expenses</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.expenseTotal.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Net income (pre-tax)</div>
              <div className={`font-mono text-lg font-semibold ${report.netIncome < 0 ? 'text-danger' : 'text-ink'}`}>
                {report.netIncome.toFixed(2)}
              </div>
            </div>
          </div>

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">Expenses by category</h2>
            {report.expensesByCategory.length === 0 ? (
              <p className="text-sm text-slate">No expenses in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Category</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {report.expensesByCategory.map((row) => (
                      <tr key={row.category} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.category}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/reports/pnl"
git commit -m "feat: P&L report page"
```

---

### Task 6: Sidebar navigation

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `Capability` (`src/lib/auth/permissions.ts`).

- [ ] **Step 1: Add two icons**

Modify `src/components/layout/Sidebar.tsx` — add after the `FlaskIcon` definition (before the `interface NavLink` block):

```tsx
const CoinsIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <ellipse cx="9" cy="7" rx="5.5" ry="3" />
    <path d="M3.5 7v4c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3V7" />
    <path d="M3.5 11v4c0 1.66 2.46 3 5.5 3 .53 0 1.04-.04 1.53-.12" />
    <ellipse cx="16.5" cy="14" rx="4" ry="2.2" />
  </svg>
)

const ScaleIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M12 3v18M8 21h8" />
    <path d="M5 7h5M14 7h5" />
    <path d="M2.5 7 5 12.5a2.6 2.6 0 005 0L12.5 7" />
    <path d="M11.5 7 14 12.5a2.6 2.6 0 005 0L21.5 7" />
  </svg>
)
```

- [ ] **Step 2: Add the two nav entries**

Modify `src/components/layout/Sidebar.tsx` — in `NAV_LINKS`, insert after the `reports/inventory` entry:

```tsx
  { href: '/reports/inventory', label: 'Stock Report', capability: 'reports.inventory.view', icon: ChartLineIcon },
  { href: '/expenses', label: 'Expenses', capability: 'accounting.expense.view', icon: CoinsIcon },
  { href: '/reports/pnl', label: 'P&L Report', capability: 'accounting.pnl.view', icon: ScaleIcon },
```

(This replaces just the `reports/inventory` line with itself plus the two new lines immediately after it — the existing line's content is unchanged.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: sidebar entries for Expenses and P&L Report"
```

---

### Task 7: Full-suite verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (424 pre-existing + this phase's ~15 new integration tests + the permissions snapshot update), zero regressions.

- [ ] **Step 2: Confirm no tax logic was introduced**

Run: `grep -rin "tax" src/lib/expenses src/lib/reports/pnl.ts "src/app/api/expenses" "src/app/api/reports/pnl" "src/app/(dashboard)/expenses" "src/app/(dashboard)/reports/pnl"`
Expected: no matches. (This is a real check, not a formality — grep for the literal string across every file this phase created.)

- [ ] **Step 3: Manual capability-boundary re-check against the exit criteria**

Confirm each of these directly against the test results from Tasks 2-3 (all should already be proven; this step is a final read-through, not new test-writing):
- `finance_admin` can record an expense and view the P&L for a date range — Task 2/3 tests.
- The P&L's revenue figure matches `buildSalesReport`'s own `byBranch` entry for the same branch/range — Task 3, test 1.
- `general_manager`/`super_admin` can view but not create — Task 2, test "general_manager and super_admin can view but not create...".
- `admin`, `branch_manager`, `cashier` get 403 on both capabilities — Task 2's cashier/admin loop, Task 3's cashier/admin/branch_manager loop.
- No tax field/calculation anywhere — Step 2 above, plus visual confirmation the `PnLReport` interface and P&L page have no tax-related field.
- `expenses` fully closed in Firestore rules — confirm by reading `firestore.rules` directly (Task 1, Step 4) and noting there is no client-reachable path to the collection anywhere in the diff.

- [ ] **Step 4: Live verification (manual, once dev server/browser access is available)**

Not a test-suite step — sign in as a real `finance_admin` test account, record a real expense, view `/expenses`, view `/reports/pnl` for a range covering it, and confirm the numbers on screen match what the API returns. Sign in as `general_manager` and confirm the "Record expense" button is absent but the list/report both render. Attempt `POST /api/expenses` directly as `admin`/`cashier`/`branch_manager` and confirm 403. Record this as done or outstanding in the completion report, matching this project's established practice of naming live verification explicitly rather than silently skipping it.

---

## After all tasks: CLAUDE.md and completion report

Once Task 7 passes, write `docs/superpowers/plans/2026-07-18-phase-26-accounting-foundation-completion.md` (following the format of prior completion reports) and update `CLAUDE.md`'s "Current status" / roadmap section to reflect Phase 26 as shipped — using only what this plan and its live verification actually confirmed, not the pasted stale document from the start of this conversation. Tag `phase-26-baseline` only if the user explicitly requests it, per this project's established tag-on-request-only practice.
