# Phase 24 — Component Treatment Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three real, screenshot-confirmed component-treatment gaps on the dashboard/shell — the Check-In button's wrong fill color, missing active-nav-item styling, and dashboard cards lacking icon badges/tinted backgrounds — using only tokens that already exist in `src/app/globals.css`.

**Architecture:** Three independent, presentation-only changes. No data logic, capability gate, or query touched anywhere. Fix 1 and Fix 2 are class-string corrections/additions on existing components. Fix 3 adds a small new icon set and extends `DashboardCard`'s props; every call site (`dashboard/page.tsx`) is updated in the same task.

**Tech Stack:** Next.js App Router, React Server/Client Components, Tailwind CSS v4 (tokens via `@theme inline`), hand-authored inline SVG icons (no icon package — matches `Sidebar.tsx`'s existing convention).

## Global Constraints

- No new or changed color/font tokens. Every class below resolves to a token already defined in `globals.css`: `marine (#0f5c66)`, `brass (#c08a28)`, `danger (#dc2626)`, `warning (#d97706)`, `info (#2563eb)`, `mist`, `ink`, `paper`, `surface`.
- `text-white` (Tailwind's built-in white, not a custom token) is reused for active-nav text — this exact `bg-marine`/`text-white` pairing was already contrast-checked in Phase 21 (5.169:1, passes AA) for the Orange Money badge; no new contrast check needed.
- Zero changes to any widget's data-fetching function, capability gate (`hasCapability` calls), or the `nurse`-exclusion test pinned in `tests/unit/permissions.test.ts`. Every task below touches only presentation.
- Fix 2's active-nav match is **exact `pathname === href`**, not prefix-matching. `startsWith` was considered and rejected: `/leave` and `/leave/review` are sibling `NAV_LINKS` entries, and prefix-matching would light up both simultaneously when viewing `/leave/review`. Exact match means a detail sub-page (e.g. `/customers/abc123`) won't highlight its parent nav item — a known, deliberate scope limit, not a bug, consistent with not expanding this phase's scope.
- Fix 3 tone mapping (state before implementing, per the brief's own instruction):

  | Widget | Tone | Why |
  |---|---|---|
  | Check In | `marine` | routine primary action, matches the just-fixed Check-In button color |
  | Revenue — last 30 days | `marine` | financial/primary, explicit in the brief |
  | Low stock | `danger` | urgency, explicit in the brief |
  | Pending deliveries | `brass` | owed/outstanding secondary accent, explicit in the brief |
  | Recent activity | `marine` | informational feed, explicit in the brief |
  | Upcoming appointments | `info` | scheduled/calendar semantic, distinct from urgency tones |
  | Pending lab orders | `warning` | awaiting someone's action (results not yet entered) |
  | Pending leave approvals | `warning` | awaiting someone's action (approval decision pending) — shares `warning` with lab orders deliberately, both are genuinely "pending action" items |

- Badge background: `bg-{tone}/10`. Badge icon color: `text-{tone}`. Card background wash: `bg-{tone}/5` (replaces the current flat `bg-surface`). All three reuse Tailwind's default opacity scale (`/5`, `/10`) — the exact same modifier syntax `Sidebar.tsx:271` already uses (`hover:bg-marine/10`), no arbitrary-value syntax needed.
- This app has no component-rendering test framework (`vitest` is configured but no `@testing-library/react`/`jsdom`) — confirmed by reading `package.json`. Verification for all three tasks is a live browser check via the connected `claude-in-chrome` session, not an automated test. This matches this project's own established convention for presentational work (Phases 21/22 — code-level review + live verification, no new test infra introduced for CSS-only changes).

---

### Task 1: Fix 1 — Check-In button color

**Files:**
- Modify: `src/components/attendance/AttendanceWidget.tsx:69`, `src/components/attendance/AttendanceWidget.tsx:86`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing new — pure class-string change, component's props/behavior unchanged

- [ ] **Step 1: Capture the current (wrong) state**

Read the two button `className` strings before editing, to make the diff obvious in review:

```
Line 69: className="rounded-lg bg-ink px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-ink/90 disabled:opacity-50"
Line 86: className="rounded-lg bg-ink px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-ink/90 disabled:opacity-50"
```

- [ ] **Step 2: Fix both buttons**

In `src/components/attendance/AttendanceWidget.tsx`, on line 69 (the "Check In" button) and line 86 (the "Check Out" button), replace `bg-ink` with `bg-marine` and `hover:bg-ink/90` with `hover:bg-marine/90`. `text-paper` stays unchanged (marine is dark enough for light text — same reasoning already applied to every other marine-filled control in this app, e.g. `NavShell.tsx:72`'s sign-out hover state).

Result for both buttons:
```tsx
className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-colors duration-200 hover:bg-marine/90 disabled:opacity-50"
```

- [ ] **Step 3: Verify live**

With the dev server running against `erp-lfd` and the browser connected:
1. Navigate to `http://localhost:3000/dashboard` as any role that has not checked in today.
2. Screenshot the "Check In" card.
3. Confirm the button renders with the marine (`#0f5c66`, dark teal) fill, not near-black.
4. Click Check In, confirm the "Check Out" button (now shown) is also marine.

Expected: both buttons visibly marine, hover state slightly lighter (90% opacity), no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/attendance/AttendanceWidget.tsx
git commit -m "fix: Check-In/Check-Out buttons use bg-marine, not leftover bg-ink"
```

---

### Task 2: Fix 2 — Active navigation, filled not outlined

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (add `'use client'`, `usePathname`, active-state class branch)

**Interfaces:**
- Consumes: `usePathname` from `next/navigation` (already a project dependency, used elsewhere e.g. `NavShell.tsx:4`)
- Produces: nothing new — `Sidebar`'s own props (`role`, `variant`) are unchanged; `NavShell.tsx` needs no changes

- [ ] **Step 1: Capture current behavior**

Confirmed by direct read: `Sidebar.tsx` currently has no `'use client'` directive and no active-route logic — every `<Link>` (the hardcoded Dashboard link at lines 283-286, and the mapped `NAV_LINKS` links at lines 290-295) always renders with the same static `linkClassName`.

- [ ] **Step 2: Add `'use client'` and `usePathname`**

At the top of `src/components/layout/Sidebar.tsx`, add as the very first line:

```tsx
'use client'
```

Then add the import right after the existing `Link` import (line 1):

```tsx
import { usePathname } from 'next/navigation'
```

- [ ] **Step 3: Compute active state and a filled class variant**

Inside `export default function Sidebar(...)`, right after `const isDrawer = variant === 'drawer'` (line 260), add:

```tsx
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href
```

Replace the existing `linkClassName` definition (lines 270-272) — keep it as the **inactive** class, and add a parallel **active** class using the same layout/spacing but a filled marine background and white text instead of `text-ink`/hover tint:

```tsx
  const linkClassName = isDrawer
    ? 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-marine/10 hover:text-marine'
    : 'flex items-center justify-center gap-0 rounded-lg px-2 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-marine/10 hover:text-marine lg:justify-start lg:gap-3 lg:px-3'

  const activeLinkClassName = isDrawer
    ? 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-marine text-white transition-colors duration-200'
    : 'flex items-center justify-center gap-0 rounded-lg px-2 py-2.5 text-sm font-medium bg-marine text-white transition-colors duration-200 lg:justify-start lg:gap-3 lg:px-3'
```

- [ ] **Step 4: Apply the active class at both render sites**

Replace the hardcoded Dashboard `<Link>` (lines 283-286):

```tsx
      <Link href="/dashboard" title="Dashboard" className={isActive('/dashboard') ? activeLinkClassName : linkClassName}>
        <HomeIcon className={iconClassName} />
        <span className={labelClassName}>Dashboard</span>
      </Link>
```

Replace the mapped `NAV_LINKS` render (lines 290-295):

```tsx
      {NAV_LINKS.filter((link) =>
        (Array.isArray(link.capability) ? link.capability : [link.capability]).some((c) => hasCapability(role, c))
      ).map((link) => (
        <Link key={link.href} href={link.href} title={link.label} className={isActive(link.href) ? activeLinkClassName : linkClassName}>
          <link.icon className={iconClassName} />
          <span className={labelClassName}>{link.label}</span>
        </Link>
      ))}
```

- [ ] **Step 5: Verify live**

With the dev server running and the browser connected:
1. Navigate to `http://localhost:3000/dashboard` as `super_admin` (sees the most nav items).
2. Screenshot the sidebar. Confirm "Dashboard" renders with a solid marine background and white text, every other item plain.
3. Navigate to `http://localhost:3000/staff`. Screenshot. Confirm "Staff" is now the filled one, "Dashboard" is back to plain, no double-highlight.
4. Navigate to `http://localhost:3000/leave/review`. Screenshot. Confirm only "Review Leave" is filled — **not** "My Leave" too (the exact sibling-prefix case the plan's exact-match decision above is protecting against).
5. Resize/check the mobile drawer variant (`variant="drawer"`) renders the same filled treatment when open.

Expected: exactly one nav item filled at a time, matching the current route; no console errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: filled marine active-nav-item state, replacing no active-state indicator at all"
```

---

### Task 3: Fix 3 — Dashboard card icon badges + tinted backgrounds

**Files:**
- Create: `src/components/dashboard/icons.tsx`
- Modify: `src/components/dashboard/DashboardCard.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Produces: `DashboardCard` new props `icon: IconComponent` (required) and `tone: 'marine' | 'brass' | 'danger' | 'warning' | 'info'` (required) — both required, not optional, so no call site can silently skip the new treatment.
- Produces: 8 named icon exports from `icons.tsx` — `ClockIcon, ChartLineIcon, BoxIcon, TruckIcon, ActivityIcon, CalendarCheckIcon, FlaskIcon, ClipboardCheckIcon` — consumed by `dashboard/page.tsx`.

- [ ] **Step 1: Create the dashboard icon set**

Create `src/components/dashboard/icons.tsx`. Same hand-authored-SVG convention as `Sidebar.tsx` (no icon package dependency), kept in its own file rather than importing from `Sidebar.tsx` since that file's icons are unexported internals, not a shared module:

```tsx
import type { ReactElement } from 'react'

interface IconProps {
  className?: string
}

export type IconComponent = (props: IconProps) => ReactElement

const ICON_SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const ClockIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

export const ChartLineIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 20V4M4 20h16" />
    <path d="M6 15l3.5-4 3 2.5L18 7" />
    <circle cx="6" cy="15" r="0.9" />
    <circle cx="9.5" cy="11" r="0.9" />
    <circle cx="12.5" cy="13.5" r="0.9" />
    <circle cx="18" cy="7" r="0.9" />
  </svg>
)

export const BoxIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 8 12 4l8 4-8 4-8-4z" />
    <path d="M4 8v8l8 4 8-4V8" />
    <path d="M12 12v8" />
  </svg>
)

export const TruckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="2" y="8" width="11" height="8" />
    <path d="M13 11h4l3 3v2h-7z" />
    <circle cx="6.5" cy="18" r="1.5" />
    <circle cx="16.5" cy="18" r="1.5" />
  </svg>
)

export const ActivityIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M3 12h4l2-7 4 14 2-7h6" />
  </svg>
)

export const CalendarCheckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="4" y="5" width="16" height="15" rx="1" />
    <path d="M4 10h16M8 3v3M16 3v3" />
    <path d="M9 14.5 11 16.5 15.5 12" />
  </svg>
)

export const FlaskIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M9 2.5h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.3h12.4a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3" />
    <path d="M7.5 15h9" />
  </svg>
)

export const ClipboardCheckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="6" y="4" width="12" height="17" rx="1" />
    <rect x="9" y="2.5" width="6" height="3" rx="1" />
    <path d="M9 13.5 11 15.5 15 11" />
  </svg>
)
```

- [ ] **Step 2: Extend `DashboardCard`**

Replace `src/components/dashboard/DashboardCard.tsx` entirely:

```tsx
import type { IconComponent } from './icons'

type Tone = 'marine' | 'brass' | 'danger' | 'warning' | 'info'

const TONE_STYLES: Record<Tone, { badgeBg: string; badgeIcon: string; wash: string }> = {
  marine: { badgeBg: 'bg-marine/10', badgeIcon: 'text-marine', wash: 'bg-marine/5' },
  brass: { badgeBg: 'bg-brass/10', badgeIcon: 'text-brass', wash: 'bg-brass/5' },
  danger: { badgeBg: 'bg-danger/10', badgeIcon: 'text-danger', wash: 'bg-danger/5' },
  warning: { badgeBg: 'bg-warning/10', badgeIcon: 'text-warning', wash: 'bg-warning/5' },
  info: { badgeBg: 'bg-info/10', badgeIcon: 'text-info', wash: 'bg-info/5' },
}

export default function DashboardCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  icon: IconComponent
  tone: Tone
  children: React.ReactNode
}) {
  const styles = TONE_STYLES[tone]
  return (
    <div className={`rounded-2xl border border-mist p-4 shadow-[var(--shadow-card)] ${styles.wash}`}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.badgeBg}`}>
          <Icon className={`h-4 w-4 ${styles.badgeIcon}`} />
        </span>
        <h2 className="text-lg font-medium text-ink">{title}</h2>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Wire icon + tone into every call site**

In `src/app/(dashboard)/dashboard/page.tsx`, add the icon imports alongside the existing widget imports (after line 19):

```tsx
import { ClockIcon, ChartLineIcon, BoxIcon, TruckIcon, ActivityIcon, CalendarCheckIcon, FlaskIcon, ClipboardCheckIcon } from '@/components/dashboard/icons'
```

Update each of the 8 `<DashboardCard>` call sites (lines 53, 57, 62, 67, 72, 77, 82, 87) to add `icon`/`tone` props, per the Global Constraints tone-mapping table. No other JSX inside each card changes:

```tsx
        <DashboardCard title="Check In" icon={ClockIcon} tone="marine">
          <AttendanceWidget />
        </DashboardCard>
        {canViewRevenue && revenueTrend && (
          <DashboardCard title="Revenue — last 30 days" icon={ChartLineIcon} tone="marine">
            <RevenueTrendChart data={revenueTrend} />
          </DashboardCard>
        )}
        {canViewLowStock && lowStock && (
          <DashboardCard title="Low stock" icon={BoxIcon} tone="danger">
            <LowStockWidget summary={lowStock} />
          </DashboardCard>
        )}
        {canViewDeliveries && deliveries && (
          <DashboardCard title="Pending deliveries" icon={TruckIcon} tone="brass">
            <PendingDeliveriesWidget summary={deliveries} />
          </DashboardCard>
        )}
        {canViewActivity && activity && (
          <DashboardCard title="Recent activity" icon={ActivityIcon} tone="marine">
            <RecentActivityWidget items={activity} />
          </DashboardCard>
        )}
        {canViewAppointments && appointments && (
          <DashboardCard title="Upcoming appointments" icon={CalendarCheckIcon} tone="info">
            <UpcomingAppointmentsWidget appointments={appointments} />
          </DashboardCard>
        )}
        {canViewLabOrders && labOrders && (
          <DashboardCard title="Pending lab orders" icon={FlaskIcon} tone="warning">
            <PendingLabOrdersWidget orders={labOrders} />
          </DashboardCard>
        )}
        {canViewLeaveApprovals && leaveApprovals && (
          <DashboardCard title="Pending leave approvals" icon={ClipboardCheckIcon} tone="warning">
            <PendingLeaveApprovalsWidget requests={leaveApprovals} />
          </DashboardCard>
        )}
```

None of the surrounding capability-gate conditionals (`canViewRevenue && revenueTrend`, etc.) change — only the `<DashboardCard>` opening tag on each.

- [ ] **Step 4: Verify live**

With the dev server running and the browser connected:
1. Navigate to `/dashboard` as `super_admin` (all 7 gated widgets + Check In render).
2. Screenshot. Confirm all 8 cards show: a small rounded-square icon badge (tinted per the tone table) to the left of the title, and the card's own background carries a very subtle matching wash (not flat white).
3. Zoom into 2-3 cards to confirm the badge icon is visibly the intended shape (clock, truck, flask, etc.) and not clipped/misaligned.
4. Navigate to `/dashboard` as `nurse`. Confirm still 0 of 7 gated widgets, only "Check In" renders (with its icon badge) — capability gating unaffected by this task.
5. Confirm no console errors, no layout shift/overflow on mobile width.

Expected: 8 visually distinct, tinted cards; nurse's dashboard unchanged in scope (still 1 card).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/icons.tsx src/components/dashboard/DashboardCard.tsx "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat: icon badges and tinted backgrounds for all 8 dashboard cards"
```

---

## After all three tasks: live verification pass (not a task — done directly, matching this project's established practice)

1. Re-run the role×widget matrix spot-check (super_admin, nurse, branch_manager at minimum) to confirm Fix 3 didn't regress any capability gate.
2. Full-page screenshots of `/dashboard` (super_admin) and `/staff` or similar (to show Fix 2's active state on a non-dashboard page).
3. Outstanding Phase 21 shell/checkout walkthrough (never done, per CLAUDE.md's own named gap): sticky sidebar behavior on scroll, mobile drawer open/close, `:focus-visible` ring on a keyboard-tabbed control, sign-out flow, and one real checkout run in `/pos` (cart math, three-way payment split, stock-aware quantity, customer picker) — through the real browser, not code review.
4. Report plainly whether live verification happened, and for anything that didn't, why not — per the brief's explicit exit criterion.
