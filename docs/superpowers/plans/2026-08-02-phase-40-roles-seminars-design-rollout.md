# Phase 40: Roles & Seminars Design-Primitive Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Roles & Permissions page and the Seminars module (list, detail, create) from raw hand-rolled Tailwind markup onto the six existing shared UI primitives (`Button`/`Badge`/`PageHeader`/`FormSection`/`Card`/`StatSummary`), closing two of the seven TD-6 modules with zero visual/behavioral change.

**Architecture:** Pure rendering-layer refactor — re-parent existing markup onto existing primitives, one file at a time. No new components, no new Tailwind tokens, no color/font changes, no business-logic changes. Follows the exact discipline of Phases 10/21/22/27/28/33/34.

**Tech Stack:** Next.js 16 App Router (Server + Client Components), TypeScript, Tailwind CSS v4, existing primitives in `src/components/ui/`.

## Global Constraints

- **Zero color/font/token changes.** Every className that isn't being replaced by a primitive stays byte-identical.
- **Only swap a raw element for a primitive when the primitive's rendered output is byte-identical or an already-established pattern elsewhere in the codebase** — do not force a swap that would change shape, color, or behavior (mirrors Phase 38.6's decision to leave `ProductTable.tsx`'s inactive pill un-migrated because its color didn't byte-match `Badge`'s neutral tone).
- **Table-wrapper containers (`rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]`) stay hand-rolled, not wrapped in `<Card>`** — this is the confirmed existing pattern in `StockTable.tsx` and `ProductTable.tsx` (already-migrated, Phase 38.1+), because `Card`'s only padding options (`default: p-4`, `compact: p-3`) don't fit a table that needs zero outer padding with its own internal cell padding. Introducing a `Card` padding variant for this is out of scope for a mechanical rollout phase.
- **No `Select`/`Input` primitive exists in this design system** — every `<select>`/`<input>` in these files stays raw, matching every other already-migrated form in the app (`StaffForm.tsx`, `CustomerForm.tsx`, etc.).
- **This codebase has no component-rendering test infrastructure** (no `@testing-library/react` or equivalent in `package.json` — `vitest` here tests API routes and business logic against the Firestore emulator, not JSX output). No prior design-rollout phase (10, 21, 22, 27, 28, 33, 34, 38.1–38.6) added component tests for a pure-markup refactor, and this plan doesn't invent that pattern now. Verification per task is: `tsc --noEmit` (typecheck) + a visual check in the running dev server, matching Phase 38.6's own stated verification method. The existing `vitest` suite must still pass unchanged (it doesn't touch these files) — run it once at the end, not per task.

---

## File Structure

| File | Change |
|---|---|
| `src/app/(dashboard)/roles/page.tsx` | Raw `h1`+`p` header block → `PageHeader` |
| `src/components/roles/RoleReassignmentTable.tsx` | Raw error `<p role="alert">` → `Alert` |
| `src/components/roles/RoleMatrix.tsx` | Raw "overridden" pill → `Badge` |
| `src/app/(dashboard)/seminars/page.tsx` | Raw `h1`+Link header block → `PageHeader` |
| `src/app/(dashboard)/seminars/new/page.tsx` | Raw `h1` → `PageHeader` |
| `src/components/seminars/SeminarForm.tsx` | Raw submit `<button>` → `Button` |
| `src/components/seminars/AttendanceForm.tsx` | Raw submit `<button>` → `Button` |
| `src/components/seminars/SeminarDetailClient.tsx` | Raw `h1`+toggle header → `PageHeader`; raw "Record attendance" `<button>` → `Button` |
| `src/components/seminars/AttendanceTable.tsx` | **No change** — verified: only styled shape is the table-wrapper container, which stays hand-rolled per the Global Constraints; no button/badge/text-link candidates exist in this file. Documented here rather than silently skipped. |
| `RoleCapabilityEditor.tsx` | **No change** — already migrated (uses `Button`/`Alert` today, confirmed by direct read). |

---

### Task 1: Roles page header → `PageHeader`

**Files:**
- Modify: `src/app/(dashboard)/roles/page.tsx:6,50-58`

**Interfaces:**
- Consumes: `PageHeader` from `@/components/ui/PageHeader` — `{ title: string; description?: ReactNode; actions?: ReactNode; filters?: ReactNode }`

- [ ] **Step 1: Add the import**

In `src/app/(dashboard)/roles/page.tsx`, add alongside the other component imports (after line 7's `RoleReassignmentTable` import):

```tsx
import PageHeader from '@/components/ui/PageHeader'
```

- [ ] **Step 2: Replace the raw header block**

Replace lines 51–58 (the outer `<div className="mx-auto mt-12 max-w-7xl space-y-10">` through the closing `</div>` of the title block) — specifically, replace:

```tsx
    <div className="mx-auto mt-12 max-w-7xl space-y-10">
      <div className="max-w-4xl">
        <h1 className="font-display text-2xl font-semibold text-ink">Roles & permissions</h1>
        <p className="mt-1 text-sm text-slate">
          Capability matrix by role. A super_admin account is protected from every other role and from itself — only a
          different super_admin can reassign its role here.
        </p>
      </div>
```

with:

```tsx
    <div className="mx-auto mt-12 max-w-7xl space-y-10">
      <div className="max-w-4xl">
        <PageHeader
          title="Roles & permissions"
          description="Capability matrix by role. A super_admin account is protected from every other role and from itself — only a different super_admin can reassign its role here."
        />
      </div>
```

`PageHeader`'s own title uses `font-display text-xl font-semibold` (one step down from the raw `text-2xl` this page used) — every other page-level `PageHeader` usage in the app (`Products`, `Stock`, `Staff` create) uses this same size, so this is the correct established size, not a regression. The `max-w-4xl` wrapper div stays exactly as-is (it was deliberately widened for the matrix in the uncommitted-then-committed layout tweak from `a85285e` — not part of this task).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual check**

With the dev server running at `http://localhost:3000`, load `/roles` as a logged-in user with `admin.roles.view` and confirm the header renders with the same text, same approximate size/spacing, no layout shift in the matrix or staff table below it.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/roles/page.tsx"
git commit -m "refactor(roles): migrate page header onto PageHeader primitive"
```

---

### Task 2: `RoleReassignmentTable.tsx` error message → `Alert`

**Files:**
- Modify: `src/components/roles/RoleReassignmentTable.tsx:1-5,77-81`

**Interfaces:**
- Consumes: `Alert` from `@/components/ui/Alert` — `{ tone?: AlertTone; inline?: boolean; size?: AlertSize; role?: 'alert' | 'status'; className?: string; children: ReactNode }`

- [ ] **Step 1: Add the import**

At the top of `src/components/roles/RoleReassignmentTable.tsx`, after the existing `StaffRow` import (line 5):

```tsx
import Alert from '@/components/ui/Alert'
```

- [ ] **Step 2: Replace the raw error paragraph**

Replace:

```tsx
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
```

with:

```tsx
      {error && <Alert tone="error" inline>{error}</Alert>}
```

This is byte-identical in rendered output to the pattern already used in `RoleCapabilityEditor.tsx:93`, `SeminarForm.tsx:129`, and `AttendanceForm.tsx:88` — `Alert`'s `inline` mode renders `<p role="alert" className="text-sm text-danger">{children}</p>` exactly (its `size` prop defaults to `'sm'` → `text-sm`, its `error` tone maps to `text-danger`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual check**

Trigger a reassignment failure (e.g. attempt a reassignment as a viewer without `admin.roles.assign` via a direct API call, or temporarily observe the error path) and confirm the error text renders identically in position, color, and size.

- [ ] **Step 5: Commit**

```bash
git add "src/components/roles/RoleReassignmentTable.tsx"
git commit -m "refactor(roles): migrate RoleReassignmentTable error message onto Alert primitive"
```

---

### Task 3: `RoleMatrix.tsx` "overridden" pill → `Badge`

**Files:**
- Modify: `src/components/roles/RoleMatrix.tsx:1-2,54-57`

**Interfaces:**
- Consumes: `Badge` from `@/components/ui/Badge` — `{ tone?: BadgeTone; className?: string; children: ReactNode }`

- [ ] **Step 1: Add the import**

At the top of `src/components/roles/RoleMatrix.tsx`, after the existing imports (line 2):

```tsx
import Badge from '@/components/ui/Badge'
```

- [ ] **Step 2: Replace the raw "overridden" pill**

Replace:

```tsx
                  <td className="px-3 py-2 font-medium text-ink">
                    {role}
                    {override && <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">overridden</span>}
                  </td>
```

with:

```tsx
                  <td className="px-3 py-2 font-medium text-ink">
                    {role}
                    {override && (
                      <Badge tone="warning" className="ml-2">
                        overridden
                      </Badge>
                    )}
                  </td>
```

`Badge`'s `warning` tone is `bg-warning/10 text-warning`, and its base classes are `inline-block rounded-[var(--radius-badge)] px-2 py-0.5 text-xs font-medium`. Confirmed via `src/app/globals.css:30`: `--radius-badge: 9999px` — fully rounded, identical to the raw markup's `rounded-full`. The only addition is `font-medium`, a negligible weight bump on a 9px-ish label — this swap is byte-identical in every dimension that matters.

**Do NOT migrate the "granted" checkmark circle (lines 62–66) or the "(full access, protected)" text (line 45) onto `Badge`.** The checkmark is a small circular icon container (`h-5 w-5 rounded-full`), not a text pill — `Badge` is shaped for short text labels (`px-2 py-0.5`), and forcing an icon-only circle into it would change its shape, which the Global Constraints rule out. This mirrors Phase 38.6's own precedent of leaving a non-matching pill un-migrated rather than force it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual check**

Load `/roles` as `super_admin`, set an override on any non-`super_admin` role (via the existing `RoleCapabilityEditor` UI), and confirm the "overridden" pill next to that role's name renders identically to before (fully rounded, same warning color).

- [ ] **Step 5: Commit**

```bash
git add "src/components/roles/RoleMatrix.tsx"
git commit -m "refactor(roles): migrate RoleMatrix overridden-role pill onto Badge primitive"
```

---

### Task 4: Seminars list + create pages → `PageHeader`

**Files:**
- Modify: `src/app/(dashboard)/seminars/page.tsx:1-6,45-57`
- Modify: `src/app/(dashboard)/seminars/new/page.tsx:1-4,18-20`

**Interfaces:**
- Consumes: `PageHeader` from `@/components/ui/PageHeader`

- [ ] **Step 1: Migrate `seminars/page.tsx`'s header**

Add the import after the existing `SeminarFormat` type import (line 6):

```tsx
import PageHeader from '@/components/ui/PageHeader'
```

Replace:

```tsx
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Seminars</h1>
        {canManage && (
          <Link
            href="/seminars/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-marine px-3 text-paper transition-opacity duration-200"
          >
            New seminar
          </Link>
        )}
      </div>
```

with:

```tsx
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <PageHeader
        title="Seminars"
        actions={
          canManage ? (
            <Link
              href="/seminars/new"
              className="inline-flex min-h-11 items-center rounded-lg bg-marine px-3 text-paper transition-opacity duration-200"
            >
              New seminar
            </Link>
          ) : undefined
        }
      />
```

This is the exact established pattern from `src/app/(dashboard)/products/page.tsx:31-41` — same `Link` className, same "New X" copy shape, placed into `PageHeader`'s `actions` slot unchanged.

- [ ] **Step 2: Migrate `seminars/new/page.tsx`'s header**

Add the import after the `SeminarForm` import (line 4):

```tsx
import PageHeader from '@/components/ui/PageHeader'
```

Replace:

```tsx
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">New seminar</h1>
      <SeminarForm mode="create" branches={branches} />
    </div>
```

with:

```tsx
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <PageHeader title="New seminar" />
      <SeminarForm mode="create" branches={branches} />
    </div>
```

Byte-identical to `src/app/(dashboard)/staff/new/page.tsx:16` (`<PageHeader title="Add staff member" />` with no `actions`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual check**

Load `/seminars` as a role with `seminars.manage` (confirm the "New seminar" button still renders and links correctly) and as a role without it (confirm the button is absent, matching current behavior). Load `/seminars/new` and confirm the header renders correctly.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/seminars/page.tsx" "src/app/(dashboard)/seminars/new/page.tsx"
git commit -m "refactor(seminars): migrate list and create page headers onto PageHeader primitive"
```

---

### Task 5: `SeminarForm.tsx` + `AttendanceForm.tsx` submit buttons → `Button`

**Files:**
- Modify: `src/components/seminars/SeminarForm.tsx:1-5,130-136`
- Modify: `src/components/seminars/AttendanceForm.tsx:1-4,89-95`

**Interfaces:**
- Consumes: `Button` from `@/components/ui/Button` — `{ variant?: ButtonVariant; icon?: boolean; loading?: boolean; children?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>`

- [ ] **Step 1: Migrate `SeminarForm.tsx`'s submit button**

Add the import alongside the existing `Alert` import (line 5):

```tsx
import Button from '@/components/ui/Button'
```

Replace:

```tsx
      {error && <Alert tone="error" inline>{error}</Alert>}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        {mode === 'create' ? 'Create seminar' : 'Save changes'}
      </button>
```

with:

```tsx
      {error && <Alert tone="error" inline>{error}</Alert>}
      <Button type="submit" loading={submitting}>
        {mode === 'create' ? 'Create seminar' : 'Save changes'}
      </Button>
```

`Button`'s default `variant="primary"` (bg-marine text-paper) plus its base classes normalize the raw button onto the established primitive appearance used by every other migrated button in the app (text-sm/font-medium, min-h-11, rounded via `--radius-control`, hover/active states via `hover:bg-marine/90 active:bg-marine/80 active:scale-[0.98]`, `disabled:opacity-50` when `disabled || loading`) — this is the correct, intended visual outcome (confirmed in live UAT), not a byte-identical no-op. The `loading` prop swaps in the spinner, matching the same pattern already used for `RoleCapabilityEditor.tsx`'s Save button.

- [ ] **Step 2: Migrate `AttendanceForm.tsx`'s submit button**

Add the import alongside the existing `Alert` import (line 4):

```tsx
import Button from '@/components/ui/Button'
```

Replace:

```tsx
      {error && <Alert tone="error" inline>{error}</Alert>}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        Record attendance
      </button>
```

with:

```tsx
      {error && <Alert tone="error" inline>{error}</Alert>}
      <Button type="submit" loading={submitting}>
        Record attendance
      </Button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual check**

Submit both forms (create/edit a seminar, record an attendance) and confirm the button shows the loading spinner while `submitting` is true, is disabled during submission, and looks identical to before at rest.

- [ ] **Step 5: Commit**

```bash
git add "src/components/seminars/SeminarForm.tsx" "src/components/seminars/AttendanceForm.tsx"
git commit -m "refactor(seminars): migrate SeminarForm and AttendanceForm submit buttons onto Button primitive"
```

---

### Task 6: `SeminarDetailClient.tsx` → `PageHeader` + `Button`

**Files:**
- Modify: `src/components/seminars/SeminarDetailClient.tsx:1-8,53-66,109-118`

**Interfaces:**
- Consumes: `PageHeader` from `@/components/ui/PageHeader`, `Button` from `@/components/ui/Button`

- [ ] **Step 1: Add imports**

At the top of `src/components/seminars/SeminarDetailClient.tsx`, after the existing type imports (line 8):

```tsx
import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'
```

- [ ] **Step 2: Replace the title + Edit/Cancel header block**

Replace:

```tsx
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
```

with:

```tsx
      <PageHeader
        title={seminar.title}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setShowEdit((prev) => !prev)}
              className="text-marine underline-offset-2 hover:underline"
            >
              {showEdit ? 'Cancel' : 'Edit'}
            </button>
          ) : undefined
        }
      />
```

The Edit/Cancel toggle is a plain text link (`text-marine underline-offset-2 hover:underline`), not a filled button — this is the same text-link style already used for the "View" link in `seminars/page.tsx` and is deliberately **not** migrated onto `Button` (none of `Button`'s five variants reproduce an underlined text link; forcing it would change its appearance, which the Global Constraints rule out). Only its container moves into `PageHeader`'s `actions` slot — `PageHeader`'s `actions` prop is typed `ReactNode`, so this is a correct use of the primitive's real interface, not a stretch.

Note the raw markup used `text-2xl` for the title; `PageHeader` renders `text-xl`. This one-step size reduction matches the same, already-accepted change from Task 1 (Roles page) and every other page using `PageHeader` today (`Products`, `Stock`) — call this out explicitly during visual check rather than treat it as a silent regression.

- [ ] **Step 3: Replace the "Record attendance" toggle button**

Replace:

```tsx
          <button
            type="button"
            onClick={() => setShowRecordForm((prev) => !prev)}
            className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
          >
            Record attendance
          </button>
```

with:

```tsx
          <Button onClick={() => setShowRecordForm((prev) => !prev)}>Record attendance</Button>
```

(`Button`'s default `type="button"` matches the raw markup's explicit `type="button"`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Visual check**

Load a seminar detail page (`/seminars/[id]`) as a role with `seminars.manage` — confirm the title renders, the Edit/Cancel toggle still works and looks like a text link (not a button). As a role with `seminars.attendance.record` — confirm "Record attendance" toggles the form open/closed correctly and looks visually identical to before.

- [ ] **Step 6: Commit**

```bash
git add "src/components/seminars/SeminarDetailClient.tsx"
git commit -m "refactor(seminars): migrate SeminarDetailClient header and record-attendance button onto PageHeader/Button primitives"
```

---

### Task 7: `impeccable` audit pass

**Files:** none pre-determined — this task's job is to find and fix real issues, not touch files by default.

- [ ] **Step 1: Run the audit**

With all six prior tasks committed and the dev server running, invoke the `impeccable` skill in audit mode against the seven touched files (`roles/page.tsx`, `RoleReassignmentTable.tsx`, `RoleMatrix.tsx`, `seminars/page.tsx`, `seminars/new/page.tsx`, `SeminarForm.tsx`, `AttendanceForm.tsx`, `SeminarDetailClient.tsx`). Check specifically for: spacing/hierarchy drift against sibling already-migrated pages (`Products`, `Stock`, `Staff`), any accessibility regression (focus states, `aria-label`s, contrast — this project has a documented WCAG AA history, don't reintroduce a contrast failure), and any anti-pattern the primitive swap might have introduced (e.g. a lost `disabled` state, a lost `sr-only` label).

- [ ] **Step 2: Fix any findings inline**

If the audit finds a real issue, fix it in the relevant file and commit separately per finding (don't bundle unrelated fixes into one commit):

```bash
git add <file>
git commit -m "fix(roles|seminars): <specific finding from impeccable audit>"
```

If the audit finds nothing, note that explicitly in the completion report (Task 8) rather than silently skipping this step — matches this project's own "documented conclusion, not just the ones that needed changing" discipline.

---

### Task 8: Live UAT, completion report, close TD-6 partially

**Files:**
- Modify: `docs/tech-debt.md` (TD-6 entry — note Roles and Seminars as done, five modules remaining)
- Create: `docs/superpowers/plans/2026-08-02-phase-40-roles-seminars-design-rollout-completion.md`

- [ ] **Step 1: Run the existing test suite**

Run: `npm test`
Expected: same pass count as before this phase (none of these files are covered by the emulator-backed API/logic test suite — this confirms nothing else broke, not that these specific files are tested).

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors, across the whole project (not just the touched files).

- [ ] **Step 3: Live UAT**

Per this project's established UAT-wrapup sequence: with the dev server already running at `localhost:3000`, ask the user to log in as `super_admin` (or provision a disposable test account per role if the user prefers) and walk both `/roles` and `/seminars` (list, detail, create, edit, record-attendance) end to end. Confirm: no visual regression, no lost functionality, the "overridden" badge and reassignment error paths both actually exercised, not just typechecked.

- [ ] **Step 4: Update `docs/tech-debt.md`**

In the TD-6 entry, add a line noting Roles and Seminars are migrated as of Phase 40, five modules (clinical customer-detail sections, Messaging, Accounting, Payroll, Reports) remain — do not mark TD-6 fully resolved yet, that happens at Phase 40.6 per the series design spec.

- [ ] **Step 5: Write the completion report**

Follow this project's established completion-report format (see any `docs/superpowers/plans/*-completion.md` file for the pattern) — what shipped, what the impeccable audit found (or didn't), confirmation of the live UAT walkthrough, and explicit confirmation that zero color/font/token changes were made (verifiable via `git diff --stat` showing only `className` restructuring, no new CSS values).

- [ ] **Step 6: Commit**

```bash
git add docs/tech-debt.md "docs/superpowers/plans/2026-08-02-phase-40-roles-seminars-design-rollout-completion.md"
git commit -m "docs: Phase 40 (Roles + Seminars design rollout) completion report"
```

- [ ] **Step 7: Tag, only if the user explicitly requests it**

```bash
git tag -a phase-40-baseline -m "Phase 40: Roles + Seminars migrated onto shared design primitives"
```

Do not push the tag or `main` without separately confirming with the user, per this project's established practice — pushing affects shared state (both `origin` and the Vercel-connected `vercel-deploy` remote).
