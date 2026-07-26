# Phase 38 — Responsive Pass + Minor Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the remaining Minor findings from Phase 36's UI/UX assessment — touch-target sizing, Login page accessibility/layout, Checkout cart-name truncation, raw-identifier leaks (duplicate email, unresolved activity-log emails), and a nav-label mismatch — bounded to what's actually verifiable given a confirmed, unresolved tool limitation.

**Architecture:** No schema, capability, or business-logic changes. Each task is a small, independently-reviewable UI/data-shape fix, following the established pattern from Phase 37 (JSX/Tailwind-only tasks verified via build + live check; tasks with real logic get a matching unit/integration test).

**Tech Stack:** Next.js App Router (Server Components + `'use client'` islands), TypeScript, Tailwind CSS v4, Firestore Admin SDK, Vitest + Firebase emulator for the suite that already exists.

## Task 0 outcome — read before starting any task

**The responsive-verification gap is still open. `resize_window` was retested with the same rigor Phase 36 used and failed identically a third time (Phases 24, 36, 38).** Two calls were made (768×1024, then 390×844 with a 2-second wait), each independently checked via `javascript_tool` reading `window.innerWidth`/`window.screen.width` rather than trusting the tool's own success message — both times the tool reported success but the viewport stayed at `1536` (the OS display width), and the mobile media query never matched. This was confirmed live, not assumed. Per the user's explicit direction after being told this: **proceed only with what's genuinely verifiable without a working resize tool**, and do not ship anything whose correctness depends on seeing a narrow viewport actually render.

This has one concrete consequence for scope, decided with the user before this plan was written:

- **The Products table responsive column-hiding enhancement (from Phase 36's Minor findings) is explicitly OUT of scope for this phase.** It was already flagged as an enhancement candidate, not a defect, and it is the one item in Phase 36's list whose entire premise — does the layout change correctly at a narrow breakpoint — cannot be checked by any method available right now (not `getBoundingClientRect`, not a code read, since the point is confirming *rendered* behavior at a width this environment cannot actually produce). Do not build it this phase. Revisit once Phase 38's own successor resolves the tool gap, or a real device/different tool becomes available.
- **Touch-target sizing is IN scope**, despite living under "Responsive fixes" in the original assessment — it does not actually require a resized viewport to verify. These are fixed CSS sizes (`min-height`/`min-width` via Tailwind's `min-h-11`/`min-w-11`, matching the 44px reference `CheckoutForm.tsx`'s own cart +/−/remove buttons already use), not something that changes at a breakpoint — Phase 36's own Assessment B measured them the same way, via `getBoundingClientRect()` at whatever viewport the browser tool was already rendering, not via a resize. Every touch-target fix in this plan is verified the same way: live measurement against the real running app, not a code-review guess and not a resized screenshot.

## Global Constraints

- No business logic, capability gating, schema, or data-model changes anywhere in this phase.
- No true responsive/breakpoint work of any kind — confirmed above, this is Phase 39 (or later)'s scope once the tool gap is resolved.
- This codebase has zero component-rendering tests anywhere (no `@testing-library` usage). Tasks that are pure JSX/Tailwind changes are verified via `npm run build` + `tsc` + live verification (element measurement via `getBoundingClientRect`, or visual/DOM confirmation) against real `erp-lfd` data — not new component test files. Task 4 (Recent Activity name resolution) is real server-side logic and gets a real integration test, matching this project's established convention.
- Running `npm test` requires a JRE on `PATH` not set by default on this machine:
  ```bash
  export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
  ```
- The 44×44px touch-target reference is `CheckoutForm.tsx`'s own existing cart quantity +/− and remove buttons (`min-h-11 min-w-11`) — reuse that exact class, don't introduce a different sizing convention.
- Design tokens: do not touch `--color-mist` (used as a neutral border/divider color everywhere in the app) to fix Login's border-contrast finding — that finding is specific to Login's two inputs, not an app-wide token problem like Phase 37's `success`/`warning` fix was. Use a different, already-existing token (`--color-slate`) scoped to just those two elements instead.

---

### Task 1: Login page — landmarks, border contrast, centering, touch-target inputs

**Files:**
- Modify: `src/app/login/page.tsx` (entire returned JSX, lines 78-123)

**Interfaces:** none — page-local markup change only, no props/exports change.

- [ ] **Step 1: Wrap the page in a `<main>` landmark, center the form, fix input border contrast and touch-target height**

Replace the entire `return (...)` block (currently lines 78-123) with:

```tsx
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="font-display text-xl font-semibold text-ink">LFD Services — Sign in</h1>
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate/70 bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-slate/70 bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
```

This is a mechanical restructure, not a rewrite: the `<form>`'s own content (both `<div>` blocks, the error paragraph, the submit button) is byte-identical except the two input `className`s changing from `border-mist` to `border-slate/70` and gaining `min-h-11`. The new element is the wrapping `<main>` (a real landmark — Next.js's root layout at `src/app/layout.tsx:32` already gives `<body>` `min-h-full flex flex-col`, so `flex-1` on this `<main>` correctly grows to fill the viewport, and `items-center justify-center` centers the form both axes instead of the old `mx-auto mt-24` top-anchored placement).

Why `border-slate/70` and not the shared `--color-mist` token: `--color-mist` (`#e2e8f0`) is this app's general-purpose neutral border/divider color, used throughout the entire app (table borders, card borders, dividers) — changing it to fix Login's specific 1.18:1 contrast failure would be an app-wide change for a single-page problem, the same category of mistake Phase 37's Task 5 was careful to avoid the other direction. `--color-slate` (`#475569`) at 70% opacity against `--color-paper` (`#f8fafc`) computes to ≈3.52:1, clearing the WCAG 1.4.11 3:1 requirement for UI-component borders with real margin, while still reading as a subtle (not heavy) border — reuses an existing token, introduces no new hex value.

- [ ] **Step 2: Build and typecheck**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Live-verify against the real app**

Using `claude-in-chrome` against a running dev server: load `/login`, confirm the form is now centered in the viewport (not anchored top-left); confirm both inputs render with a visibly darker border than before; confirm via `read_page`/DOM inspection that a `<main>` landmark now wraps the form (e.g. `document.querySelector('main')` is non-null and contains the form). Measure both inputs via `getBoundingClientRect()` and confirm height ≥ 44px.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "fix(login): add main landmark, center form, fix input border contrast to 3:1, bump inputs to 44px"
```

---

### Task 2: Touch-target sizing (Sign out, Check In/Out, POS checkout elements)

**Files:**
- Modify: `src/components/layout/NavShell.tsx:85-90`
- Modify: `src/components/attendance/AttendanceWidget.tsx` (two button `className`s, lines 76 and 93)
- Modify: `src/components/pos/CheckoutForm.tsx` (six distinct `className` strings, several shared across multiple elements)

**Interfaces:** none — className-only changes, no props/exports change.

- [ ] **Step 1: Sign out button**

In `src/components/layout/NavShell.tsx`, the Sign out button is currently:

```tsx
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-lg border border-mist px-3 py-1.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-marine hover:bg-marine hover:text-paper"
          >
            Sign out
          </button>
```

Change the `className` to:

```tsx
            className="min-h-11 shrink-0 rounded-lg border border-mist px-3 py-1.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-marine hover:bg-marine hover:text-paper"
```

- [ ] **Step 2: Check In / Check Out buttons**

In `src/components/attendance/AttendanceWidget.tsx`, both buttons share this exact `className` (lines 76 and 93):

```
className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-marine/90 disabled:opacity-50"
```

Use `replace_all` to change both occurrences to:

```
className="min-h-11 rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-marine/90 disabled:opacity-50"
```

- [ ] **Step 3: POS checkout — text inputs shared across three fields**

In `src/components/pos/CheckoutForm.tsx`, this exact `className` string appears three times — the main search input (`#pos-search`), the quick-add name input (`#pos-quick-add-name`), and the quick-add phone input (`#pos-quick-add-phone`):

```
className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
```

Use `replace_all` to change all three occurrences to:

```
className="min-h-11 w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
```

- [ ] **Step 4: POS checkout — customer search input**

The customer-picker search input (`#pos-customer-search`) has its own distinct `className` (it's `flex-1`, not `w-full`, since it sits next to the Close button):

```
className="flex-1 rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
```

Change to:

```
className="min-h-11 flex-1 rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
```

- [ ] **Step 5: POS checkout — search-result and customer-picker rows**

This exact `className` string appears three times — the product search-result row, the service search-result row, and the customer-picker row:

```
className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-mist"
```

Use `replace_all` to change all three occurrences to:

```
className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-mist"
```

- [ ] **Step 6: POS checkout — discount input**

The discount input has a distinct `className` (has `font-mono`, no other element matches it):

```
className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink focus:border-marine"
```

Change to:

```
className="min-h-11 w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink focus:border-marine"
```

- [ ] **Step 7: POS checkout — payment amount input**

The payment amount input's `className` is a template literal with a conditional class. Currently:

```tsx
                    className={`w-full rounded-lg border bg-paper px-3 py-2 font-mono text-ink focus:border-marine ${
                      hasAmount ? 'border-ink/30 shadow-[inset_0_1px_5px_rgba(0,0,0,0.35)]' : 'border-mist'
                    }`}
```

Change the static portion to add `min-h-11`:

```tsx
                    className={`min-h-11 w-full rounded-lg border bg-paper px-3 py-2 font-mono text-ink focus:border-marine ${
                      hasAmount ? 'border-ink/30 shadow-[inset_0_1px_5px_rgba(0,0,0,0.35)]' : 'border-mist'
                    }`}
```

- [ ] **Step 8: POS checkout — payment reference input**

The MTN MoMo/Orange Money reference input has a distinct `className` (has `mt-2 ... text-sm`, no other element matches it):

```
className="mt-2 w-full rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
```

Change to:

```
className="mt-2 min-h-11 w-full rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
```

- [ ] **Step 9: Build and typecheck**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 10: Live-verify every changed element's rendered size**

Using `claude-in-chrome` against a running dev server, for each of the elements above, use `javascript_tool` to run `getBoundingClientRect()` against the actual rendered element (e.g. `document.querySelector('#pos-search').getBoundingClientRect().height`) and confirm height ≥ 44px for every one: Sign out button (NavShell, visible on any authenticated page), Check In button (Dashboard, as a role without an existing check-in), the six checkout elements (as `cashier`/`branch_manager` on `/pos` — search input, a product row, a service row, the customer-picker search input and a customer row after opening the picker, the discount input, at least one payment amount input, and the MTN MoMo reference input after entering an amount). This is real measurement against the real running app, not a resized-viewport screenshot — consistent with Task 0's finding above.

- [ ] **Step 11: Commit**

```bash
git add src/components/layout/NavShell.tsx src/components/attendance/AttendanceWidget.tsx src/components/pos/CheckoutForm.tsx
git commit -m "fix(a11y): bump undersized touch targets to the existing 44px reference across nav, attendance, and POS checkout"
```

---

### Task 3: Cart line-item name truncation

**Files:**
- Modify: `src/components/pos/CheckoutForm.tsx:572`

**Interfaces:** none.

- [ ] **Step 1: Let the cart line name use available row width before truncating**

The cart line-item name currently always single-line-truncates regardless of how much space is actually free in the row:

```tsx
                    <p className="truncate text-sm text-ink" title={line.name}>
```

Change to:

```tsx
                    <p className="break-words text-sm text-ink" title={line.name}>
```

`break-words` lets the name wrap onto a second line when the row has room rather than always ellipsizing at one line — the row's sibling elements (quantity controls / `qty 1`, the line-total price, the remove button) are all `shrink-0`-width, so the name column already has whatever slack space is left in the row available to it once its siblings are laid out; wrapping uses that space instead of clipping it away. `title={line.name}` stays as a fallback for a name still too long to read comfortably even wrapped.

- [ ] **Step 2: Build and typecheck**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Live-verify against the real app**

Using `claude-in-chrome`: add a real product with a long name to the cart (e.g. "Bottled Water 500ml" or a longer one if a longer-named real product exists in `erp-lfd`), confirm the full name is now visible (wrapped onto a second line if needed) rather than ellipsized, and confirm the row layout doesn't break (quantity controls/price/remove button stay aligned).

- [ ] **Step 4: Commit**

```bash
git add src/components/pos/CheckoutForm.tsx
git commit -m "fix(pos): let cart line-item names wrap into available row space before truncating"
```

---

### Task 4: Raw-identifier fixes — duplicate email, unresolved activity-log emails

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx` (header `<h1>`)
- Modify: `src/lib/dashboard/recentActivity.ts` (`RecentActivityItem` interface, `getRecentActivity`)
- Modify: `src/components/dashboard/RecentActivityWidget.tsx` (render `actorName` instead of `actorEmail`)
- Modify: `tests/setup/fixtures.ts` (`seedAuditLogEntry` gains an optional `actorUid` param)
- Modify: `tests/integration/dashboardRecentActivity.test.ts` (new coverage for name resolution)

**Interfaces:**
- Produces: `RecentActivityItem.actorName: string` (replaces `actorEmail: string | null`) — resolved via the same batch-fetch shape `src/lib/pos/getSaleDetail.ts` already established for `cashierName` (`Promise.all` over unique uids against the `staff` collection, falling back to the raw identifier if no match).
- Consumes (test only): `seedAuditLogEntry(input: { action: string; branchId: string | null; createdAt: Date; actorEmail?: string; actorUid?: string })` — `actorUid` defaults to `'test-actor'` exactly as today, so every existing call site is unaffected.

- [ ] **Step 1: Drop the duplicate email from the Dashboard header**

In `src/app/(dashboard)/dashboard/page.tsx`, the header currently repeats the email already shown in `NavShell`'s top bar on every page:

```tsx
        <h1 className="text-xl font-semibold text-ink">Welcome, {user.email}</h1>
```

Change to:

```tsx
        <h1 className="text-xl font-semibold text-ink">Welcome</h1>
```

- [ ] **Step 2: Extend the `seedAuditLogEntry` test fixture with an optional `actorUid`**

In `tests/setup/fixtures.ts`, the function is currently (lines 151-164):

```ts
export async function seedAuditLogEntry(input: { action: string; branchId: string | null; createdAt: Date; actorEmail?: string }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('auditLogs').doc()
  await ref.set({
    action: input.action,
    actorUid: 'test-actor',
    actorEmail: input.actorEmail ?? 'actor@test.local',
    targetUid: null,
    branchId: input.branchId,
    details: null,
    createdAt: input.createdAt,
  })
  return { id: ref.id }
}
```

Change to:

```ts
export async function seedAuditLogEntry(input: { action: string; branchId: string | null; createdAt: Date; actorEmail?: string; actorUid?: string }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('auditLogs').doc()
  await ref.set({
    action: input.action,
    actorUid: input.actorUid ?? 'test-actor',
    actorEmail: input.actorEmail ?? 'actor@test.local',
    targetUid: null,
    branchId: input.branchId,
    details: null,
    createdAt: input.createdAt,
  })
  return { id: ref.id }
}
```

Every existing call site (in `tests/integration/dashboardRecentActivity.test.ts` and anywhere else this fixture is used) omits `actorUid`, so it keeps getting `'test-actor'` exactly as before — this change is purely additive.

- [ ] **Step 3: Resolve `actorEmail` to a real staff name in `getRecentActivity`**

In `src/lib/dashboard/recentActivity.ts`, change the `RecentActivityItem` interface (currently lines 24-30):

```ts
export interface RecentActivityItem {
  id: string
  action: AuditAction
  actorName: string
  branchId: string | null
  createdAt: string
}
```

Replace the entire `getRecentActivity` function body (currently lines 43-68) with:

```ts
export async function getRecentActivity(viewer: SessionUser): Promise<RecentActivityItem[]> {
  if (!hasCapability(viewer.role, 'dashboard.activity.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const snap = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(RECENT_WINDOW_SIZE).get()

  const branchLocked = isBranchLocked(viewer.role)
  const matched: { id: string; action: AuditAction; actorUid: string | null; actorEmail: string | null; branchId: string | null; createdAt: string }[] = []
  for (const doc of snap.docs) {
    const entry = doc.data() as AuditLogEntry
    if (!ACTIVITY_ACTION_SET.has(entry.action)) continue
    if (branchLocked && entry.branchId !== viewer.branchId && entry.branchId !== null) continue
    matched.push({
      id: doc.id,
      action: entry.action,
      actorUid: entry.actorUid,
      actorEmail: entry.actorEmail,
      branchId: entry.branchId,
      createdAt: entry.createdAt.toDate().toISOString(),
    })
    if (matched.length >= RESULT_LIMIT) break
  }

  // Resolve raw actor identities to real staff names — the same class of
  // raw-identifier leak Phase 37 fixed for the Dashboard's own branch
  // display (getBranchName), and the same batch-fetch shape
  // getSaleDetail.ts already established for resolving cashierName.
  const uniqueActorUids = Array.from(new Set(matched.map((m) => m.actorUid).filter((uid): uid is string => uid !== null)))
  const staffDocs = await Promise.all(uniqueActorUids.map((uid) => db.collection('staff').doc(uid).get()))
  const staffNames: Record<string, string> = {}
  uniqueActorUids.forEach((uid, i) => {
    staffNames[uid] = (staffDocs[i].data()?.name as string | undefined) ?? uid
  })

  return matched.map((m) => ({
    id: m.id,
    action: m.action,
    actorName: m.actorUid ? (staffNames[m.actorUid] ?? m.actorEmail ?? m.actorUid) : (m.actorEmail ?? 'Unknown'),
    branchId: m.branchId,
    createdAt: m.createdAt,
  }))
}
```

- [ ] **Step 4: Write the new test coverage**

In `tests/integration/dashboardRecentActivity.test.ts`, add `seedStaff` to the existing fixtures import (currently line 2: `import { resetEmulator, seedBranch, seedAuditLogEntry } from '../setup/fixtures'` → add `seedStaff`), and add this inside the existing `beforeAll` (after the existing `seedAuditLogEntry` calls, still using the `t()` future-timestamp helper already defined there):

```ts
    const namedStaff = await seedStaff({ role: 'cashier', branchId: branchA, email: 'named-actor@test.local' })
    await seedAuditLogEntry({ action: 'sale_create', branchId: branchA, createdAt: t(45), actorUid: namedStaff.uid })
```

Add these two new `it` blocks after the existing four:

```ts
  it('resolves a matching staff uid to their real name, not the raw email', async () => {
    const items = await getRecentActivity(branchManagerUser)
    expect(items.some((i) => i.actorName === 'Test cashier')).toBe(true)
  })

  it('falls back to the raw email when actorUid has no matching staff doc', async () => {
    const items = await getRecentActivity(branchManagerUser)
    expect(items.some((i) => i.actorName === 'actor@test.local')).toBe(true)
  })
```

(`seedStaff`'s fixture, per `tests/setup/fixtures.ts:51`, names every seeded staff member `Test ${role}` — `'Test cashier'` for a `role: 'cashier'` seed, confirmed by reading that fixture directly.)

- [ ] **Step 5: Update `RecentActivityWidget.tsx` to render the resolved name**

In `src/components/dashboard/RecentActivityWidget.tsx`, the render currently is:

```tsx
              <span className="text-ink">
                {ACTION_LABELS[item.action] ?? item.action}
                {item.actorEmail && <span className="ml-2 text-xs text-slate">{item.actorEmail}</span>}
              </span>
```

Change to:

```tsx
              <span className="text-ink">
                {ACTION_LABELS[item.action] ?? item.action}
                <span className="ml-2 text-xs text-slate">{item.actorName}</span>
              </span>
```

(`actorName` is always a non-empty string per the interface above, so the conditional `&&` guard is no longer needed — it was only ever guarding against `actorEmail` being `null`.)

- [ ] **Step 6: Run the focused test, then the full suite**

```bash
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
npm test -- dashboardRecentActivity
```
Expected: all assertions in that file pass, including the two new ones.

```bash
npm test
```
Expected: full suite passes (511 + 2 new = 513).

- [ ] **Step 7: Build**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 8: Live-verify against the real app**

Using `claude-in-chrome`: load `/dashboard`, confirm the header now reads "Welcome" without repeating the email already shown in the top bar; confirm the Recent Activity widget (as a role that holds `dashboard.activity.view`) shows resolved staff names, not raw emails, for entries whose actor is a real staff member.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx src/lib/dashboard/recentActivity.ts src/components/dashboard/RecentActivityWidget.tsx tests/setup/fixtures.ts tests/integration/dashboardRecentActivity.test.ts
git commit -m "fix(dashboard): drop duplicate email from header, resolve Recent Activity's raw emails to real staff names"
```

---

### Task 5: Sidebar label alignment

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:279`

**Interfaces:** none.

- [ ] **Step 1: Match the sidebar label to the page's own H1**

`src/app/(dashboard)/pos/page.tsx`'s own `<h1>` reads "Checkout" (not "New Sale"), and this app's established convention is that a sidebar label mirrors the page's actual H1 exactly — confirmed directly: the sibling `/pos/sales` entry is labeled `'Sales Log'`, matching `pos/sales/page.tsx`'s own `<h1>` ("Sales log") exactly. `/pos`'s entry is the one place this has drifted.

In `src/components/layout/Sidebar.tsx`, change:

```ts
      { href: '/pos', label: 'New Sale', capability: 'pos.sale.create', icon: CartIcon },
```

to:

```ts
      { href: '/pos', label: 'Checkout', capability: 'pos.sale.create', icon: CartIcon },
```

- [ ] **Step 2: Build and typecheck**

```bash
npm run build
```
Expected: exits 0.

- [ ] **Step 3: Live-verify against the real app**

Using `claude-in-chrome`: confirm the sidebar now reads "Checkout" for the `/pos` link, matching the page's own H1, in both the persistent (desktop/tablet) and drawer (mobile) sidebar variants (both render from the same `NAV_GROUPS` data, so one code change covers both — confirm at least the persistent variant renders correctly since that's the one reachable without the broken resize tool).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "fix(nav): align POS sidebar label with the Checkout page's own H1"
```

---

### Task 6: Completion report

**Files:**
- Create: `docs/superpowers/plans/2026-07-22-phase-38-responsive-pass-minor-findings-completion.md`
- Modify: `CLAUDE.md` (status line)

**Interfaces:** none — documentation only.

- [ ] **Step 1: Confirm full-suite regression**

```bash
export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH"
npm test
npm run build
```
Expected: both exit 0. Record the test count in the completion report.

- [ ] **Step 2: Write the completion report**

State Task 0's outcome plainly and first, per this phase's own exit criteria: `resize_window` failed a third time, confirmed via the same independent-`window.innerWidth`-check method Phase 36 used, and the Products table column-hiding enhancement was explicitly deferred as a result — not built, not guessed at. Cover each of Tasks 1-5: what was fixed, and for each, whether verification was a real rendered/measured check (all of them, in this phase — every fix here was either a fixed-size CSS property measurable at the current viewport, or non-visual logic covered by a real test) versus anything code-review-only (should be none, but state this explicitly rather than leaving it implied). Confirm no business logic, capability, or schema changed anywhere, matching this phase's exit criteria.

- [ ] **Step 3: Update CLAUDE.md's status line**

Add one sentence to the end of the `Current status` section (after the Phase 37 paragraph) summarizing Phase 38: the five shipped fixes, the Task 0 outcome (tool still broken, third occurrence, Products table deferred as a direct result), and that a genuinely working responsive-verification method is still an open, carried-forward item for whichever phase next needs true breakpoint verification.

- [ ] **Step 4: Commit, then tag**

```bash
git add docs/superpowers/plans/2026-07-22-phase-38-responsive-pass-minor-findings-completion.md CLAUDE.md
git commit -m "docs: Phase 38 responsive pass + minor findings completion report, CLAUDE.md status update"
git tag -a phase-38-baseline -m "Phase 38: touch-target sizing, Login accessibility, raw-identifier fixes — resize_window confirmed broken a third time, Products table column-hiding deferred as a result"
```
