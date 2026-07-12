# Phase 21 — Design System Replacement (Tokens + Shell + POS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 9's design system (marine/brass on Space Grotesk/IBM Plex, warm off-white neutrals) with a new one (marine/brass kept in their existing roles, on Inter/JetBrains Mono, cool Slate-gray neutrals) — confirmed, deliberate discarding of three phases of previously clean, audited design work, on the exact two surfaces Phase 9 originally covered: the navigation shell and POS/checkout. Presentation only — zero behavior changes anywhere.

**Architecture:** Colors and fonts are 100% Tailwind-utility-class references with zero hardcoded hex/inline styles anywhere in `src/` (confirmed by a repo-wide scan) — `globals.css`'s `@theme inline` block and `layout.tsx`'s font loaders are the only two files that need to change to cascade the new palette/typography everywhere. Radius/shadow/spacing are inline Tailwind classes per element with no shared token — achieving the new card/table/button/input/badge/nav treatment requires direct component edits, scoped to `Sidebar.tsx`, `NavShell.tsx`, `CheckoutForm.tsx`, `QueuedSaleReceipt.tsx`, and `pos/page.tsx` only.

**Tech Stack:** Tailwind CSS v4 (`@theme inline` in `globals.css`, no `tailwind.config.js`), Next.js `next/font/google` (Inter, JetBrains Mono replacing Space Grotesk/IBM Plex Sans/IBM Plex Mono).

## Global Constraints

- **Zero behavior changes.** Every event handler, validation rule, API call, and piece of business logic in the touched files is untouched — same cart math, same three-way payment split with conditional reference codes, same stock decrement, same customer-picker optional/walk-in-default behavior, same discount/price-resolution logic. Every task's diff should show only `className` changes (plus the two new font-loader imports in `layout.tsx`) — no JS logic, no JSX structural/conditional changes, no new state, no new props beyond what styling requires.
- **Scope is exactly:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/NavShell.tsx`, `src/components/pos/CheckoutForm.tsx`, `src/components/pos/QueuedSaleReceipt.tsx`, `src/app/(dashboard)/pos/page.tsx`. Confirmed with the user: no other POS component (`PendingDeliveriesSection.tsx`, `SalesTable.tsx`, `VoidSaleButton.tsx`, `QueueStatusIndicator.tsx` — the last already covered structurally since it renders inside `NavShell.tsx`'s header, but its own internal markup is not touched) and no other screen (products/services/suppliers/stock/customers/staff/departments/branches/roles/settings/HR/reports/clinical/messaging/seminars) gets structural changes this phase.
- **Confirmed with the user: the global token/typography cascade is accepted.** `globals.css`/`layout.tsx` are shared files referenced by ~48 already-styled files app-wide — redefining them changes colors and typography on every existing screen immediately as a structural consequence of a shared token system, exactly as Phase 9 originally established these tokens once for the whole app. Only Sidebar/NavShell/POS get deliberate structural (radius/shadow/spacing/component-treatment) polish this phase; every other screen keeps its existing Phase 9/10/11 structural layout, inheriting only the new colors/fonts through unchanged class names, until a follow-up phase gives it the same treatment.
- Responsive to mobile/tablet width, visible `:focus-visible` keyboard focus, motion restrained to 150-250ms and respecting `prefers-reduced-motion` (the existing `@media (prefers-reduced-motion: reduce)` block in `globals.css` already handles this globally and needs no change).

---

## New token values (the plan's own judgment calls, flagged for review — not silently assumed)

The brief gives "approximately" hex guidance for background/primary-text and adjectives ("muted green," "professional red," "amber," "blue") for the four semantic colors. Two judgment calls made here, worth confirming at go-ahead rather than treated as settled:

1. **All four semantic colors get new, mutually-consistent hex values** (not just the two new ones, warning/info) — the existing `success`/`danger` values (`#1e7a4c`/`#b23a3a`) come from the old warm-neutral family and would sit inconsistently next to new Tailwind-standard warning/info colors if left unchanged. Proposed: `success #16a34a`, `danger #dc2626`, `warning #d97706`, `info #2563eb` — all standard Tailwind 600-weight shades, chosen to harmonize with the new Slate-50/Slate-900 neutral pair (which the brief itself named via Tailwind's "Slate 50" convention).
2. **`tender-orange` is retired**, not carried into the new system. It's used in exactly two places (both in scope: a Mobile Money/Orange Money optional-reference-code advisory banner in `CheckoutForm.tsx` and `QueuedSaleReceipt.tsx`) and isn't named anywhere in the new brief. CLAUDE.md's own note on this token ("worth confirming visually... close enough in family to double check") suggests it was already an uncertain choice. Proposed: migrate that banner to `--color-info` (blue) — it's an optional-field hint, not a warning or an error, which is what `info` is for.

```css
/* src/app/globals.css — @theme inline block, full replacement */
--color-ink: #0f172a;        /* was #1a1d22 */
--color-paper: #f8fafc;      /* was #f7f6f3 — Slate 50 */
--color-surface: #ffffff;    /* NEW — cards, elevated above --color-paper */
--color-marine: #0f5c66;     /* UNCHANGED — kept in its established primary-accent role */
--color-brass: #c08a28;      /* UNCHANGED — kept in its established secondary-accent role */
--color-mist: #e2e8f0;       /* was #e4e7e9 — thin/subtle border, Slate 200 */
--color-slate: #475569;      /* was #5b6470 — secondary text, real contrast (~8.3:1 on white) */
--color-success: #16a34a;    /* was #1e7a4c */
--color-danger: #dc2626;     /* was #b23a3a */
--color-warning: #d97706;    /* NEW */
--color-info: #2563eb;       /* NEW */
/* --color-tender-orange retired — its two call sites move to --color-info */

--color-background: var(--color-paper);
--color-foreground: var(--color-ink);

--font-display: var(--font-inter);         /* was --font-display-space-grotesk */
--font-sans: var(--font-inter);            /* was --font-sans-ibm-plex */
--font-mono: var(--font-jetbrains-mono);   /* was --font-mono-ibm-plex */

--shadow-card: 0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 1px rgb(15 23 42 / 0.06);
```

`--font-display` is kept as a distinct token (still pointing at Inter, same as `--font-sans`) rather than removed, since 38 out-of-scope files reference the `font-display` utility class — removing the token would break those pages' typography as an unintended side effect of this phase; keeping it (now resolving to Inter, satisfying "Inter everywhere — headings, body... replacing... Space Grotesk") is the zero-collateral-damage choice.

`--shadow-card` is new — Tailwind v4 has no built-in "soft shadow" utility, and a bespoke shadow keyed to `--color-ink` (rather than pure black) reads less generic than Tailwind's default `shadow-sm`/`shadow-md`, consistent with the brief's "soft shadow... no gradients, no glassmorphism, no neumorphism" instruction to keep card elevation understated and deliberate rather than templated.

---

## Task 1: Tokens + typography (global cascade)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `--color-ink`/`--color-paper`/`--color-surface`/`--color-marine`/`--color-brass`/`--color-mist`/`--color-slate`/`--color-success`/`--color-danger`/`--color-warning`/`--color-info` and `--shadow-card` as new/updated CSS custom properties, consumed by Tasks 2-3 via their generated Tailwind utility classes (`bg-surface`, `text-warning`, `shadow-[var(--shadow-card)]`, etc.) and, as an accepted side effect, by all 38+ out-of-scope files already using `bg-paper`/`text-ink`/`font-display`/etc.
- Consumes: nothing (root-level config).

- [ ] **Step 1: Replace the `@theme inline` block in `globals.css`**

```css
@import "tailwindcss";

@theme inline {
  --color-ink: #0f172a;
  --color-paper: #f8fafc;
  --color-surface: #ffffff;
  --color-marine: #0f5c66;
  --color-brass: #c08a28;
  --color-mist: #e2e8f0;
  --color-slate: #475569;
  --color-success: #16a34a;
  --color-danger: #dc2626;
  --color-warning: #d97706;
  --color-info: #2563eb;

  /* Conventional Tailwind v4 names other utilities may already reference. */
  --color-background: var(--color-paper);
  --color-foreground: var(--color-ink);

  --font-display: var(--font-inter);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-jetbrains-mono);

  --shadow-card: 0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 1px rgb(15 23 42 / 0.06);
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
}

.font-mono,
code,
kbd,
pre,
samp {
  font-variant-numeric: tabular-nums;
}

:focus-visible {
  outline: 2px solid var(--color-marine);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
```

(Only the `@theme inline` block's contents change — `body`, `.font-mono`/etc., `:focus-visible`, and the reduced-motion block are copied verbatim from the current file, unchanged.)

- [ ] **Step 2: Replace the font loaders in `layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LFD Services ERP",
  description: "Enterprise ERP for LFD Services — POS, inventory, CRM, accounting, and HR.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Start the dev server and visually sanity-check the global cascade**

Run: `npm run dev`, open `/dashboard` (or any page reachable after login) plus at least 3 out-of-scope screens (e.g. `/products`, `/staff`, a clinical page like `/customers/[id]` if reachable). Confirm:
- Text is legible everywhere (no white-on-white or low-contrast regressions from the new `--color-ink`/`--color-slate`/`--color-paper` values landing on out-of-scope screens' existing structural layout).
- No visibly broken/undefined utility class (a missing `--color-tender-orange` reference outside the two files Task 3 will touch would be the one thing to catch here — confirmed by the earlier investigation there are none, but this is the empirical check).
- `font-display`/`font-sans` render as Inter, `font-mono` renders as JetBrains Mono, on both in-scope and out-of-scope pages.

This step is a sanity check, not a redesign of out-of-scope screens — if something looks off structurally (spacing, layout) on an out-of-scope page, that's expected and out of bounds for this phase; only flag an actual regression (illegible text, broken class, layout collapse).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): replace Phase 9 tokens/typography with the new palette and Inter/JetBrains Mono"
```

---

## Task 2: Shell restyle (`Sidebar.tsx` + `NavShell.tsx`)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/NavShell.tsx`

**Interfaces:**
- Consumes: the tokens from Task 1 (`bg-paper`, `bg-surface`, `border-mist`, `text-ink`, `text-slate`, `text-marine`, `shadow-[var(--shadow-card)]`, etc.) via Tailwind utility classes only.
- Produces: no new exported props/interfaces — `Sidebar`'s existing `{ role, variant }` props and `NavShell`'s existing `{ user, children }` props are unchanged.

- [ ] **Step 1: Restyle `Sidebar.tsx`'s container and nav items**

Apply the new component guidance ("Navigation: minimal, icon-driven, generous spacing, rounded active state, sticky") to the existing structure — every `className` string gets updated per this mapping, no JSX structure/logic change:

| Element | Before | After |
|---|---|---|
| Persistent variant container | `flex h-full w-64 flex-col gap-1 bg-paper p-4` | `flex h-full w-64 flex-col gap-1.5 bg-paper p-5 sticky top-0` |
| Drawer variant container | `flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-mist bg-paper p-2 lg:w-60 lg:items-stretch lg:p-4` | `flex h-full w-16 shrink-0 flex-col items-center gap-1.5 border-r border-mist bg-paper p-3 lg:w-60 lg:items-stretch lg:p-5` |
| Nav item (persistent) | `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-marine/10 hover:text-marine` | `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-marine/10 hover:text-marine` |
| Nav item (drawer, collapsed-friendly) | `flex items-center justify-center gap-0 rounded-md px-2 py-2 text-sm font-medium text-ink transition-colors hover:bg-marine/10 hover:text-marine lg:justify-start lg:gap-3 lg:px-3` | `flex items-center justify-center gap-0 rounded-lg px-2 py-2.5 text-sm font-medium text-ink transition-colors duration-200 hover:bg-marine/10 hover:text-marine lg:justify-start lg:gap-3 lg:px-3` |
| Active nav item (if the file has an active-state branch — check `Sidebar.tsx` directly, since this table is from the file as last read and an active-state class string may exist elsewhere in the file not shown here) | *(read the actual active-state className string from the file)* | append/replace with `bg-marine/10 text-marine font-semibold` — rounded active state per the brief, consistent with the hover treatment already using `bg-marine/10`/`text-marine` |
| "Menu" section label | `font-display text-xs font-semibold uppercase tracking-wider text-slate` | `font-display text-xs font-semibold uppercase tracking-wider text-slate` *(unchanged — already matches the new guidance: uppercase muted label)* |

Read the full current file before editing (it's longer than the three lines captured during investigation) — apply the same *kind* of change (radius `md`→`lg`, padding tightened slightly less cramped, `duration-200` added to transitions, `gap` slightly opened up) to every other className string in the file that isn't in this table, following the brief's "generous spacing, rounded active state" guidance consistently rather than only touching the lines enumerated here.

- [ ] **Step 2: Restyle `NavShell.tsx`'s header and content wrapper**

| Element | Before | After |
|---|---|---|
| Header | `flex items-center justify-between gap-2 border-b border-mist bg-paper px-4 md:px-6 py-3` | `flex items-center justify-between gap-2 border-b border-mist bg-surface px-4 md:px-6 py-3.5 sticky top-0 z-30` |
| Mobile hamburger button | `md:hidden rounded-md border border-mist px-3 py-1.5 text-sm text-ink transition-colors hover:bg-mist` | `md:hidden rounded-lg border border-mist px-3 py-1.5 text-sm text-ink transition-colors duration-200 hover:bg-mist` |
| User email/role text | `text-sm text-slate truncate` | `text-sm text-slate truncate` *(unchanged)* |
| Sign out button | `shrink-0 rounded-md border border-mist px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-marine hover:bg-marine hover:text-paper` | `shrink-0 rounded-lg border border-mist px-3 py-1.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-marine hover:bg-marine hover:text-paper` |
| Mobile drawer backdrop | `md:hidden fixed inset-0 z-40 flex` / `absolute inset-0 bg-ink/40` | unchanged (already token-driven, no radius/shadow involved) |
| Mobile drawer panel | `relative z-50 shadow-xl` | `relative z-50 shadow-[var(--shadow-card)]` — replaces the generic `shadow-xl` with the new bespoke soft-shadow token, consistent with "no dramatic" elevation |
| Main content area | `flex-1 overflow-x-auto bg-paper p-4 md:p-6` | unchanged — this wraps *every* dashboard route's content, including out-of-scope screens; changing its padding would visibly restructure every other screen's spacing, which is out of bounds per the Global Constraints |

The header becoming `sticky top-0` is new per the brief's "Navigation:... sticky" guidance — confirm it doesn't visually conflict with any existing sticky/z-index element on the two in-scope pages during Step 3's manual check.

- [ ] **Step 3: Manual visual + interaction check**

Run: `npm run dev`, log in, confirm: sidebar nav items show the new rounded-lg hover/active treatment, header is sticky on scroll (test on a page with enough content to scroll, e.g. the products list reached via the sidebar), mobile drawer still opens/closes correctly (resize to a mobile viewport or use browser dev tools device emulation), keyboard `Tab` through nav items shows the `:focus-visible` marine outline (unchanged token, should just work), sign-out button still logs out correctly (this is the one piece of actual behavior in this file — confirm the `handleLogout` flow is untouched and still works).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/NavShell.tsx
git commit -m "style(shell): restyle Sidebar and NavShell for the new design system"
```

---

## Task 3: POS/checkout restyle (`CheckoutForm.tsx` + `QueuedSaleReceipt.tsx` + `pos/page.tsx`)

**Files:**
- Modify: `src/components/pos/CheckoutForm.tsx`
- Modify: `src/components/pos/QueuedSaleReceipt.tsx`
- Modify: `src/app/(dashboard)/pos/page.tsx`

**Interfaces:**
- Consumes: tokens from Task 1. No new/changed props on any of the three files — `CheckoutForm`'s `{ products, services, customers, branchId }`, `QueuedSaleReceipt`'s existing props, and `pos/page.tsx`'s server-side data fetching are all untouched.

This is the highest-stakes task in the phase — the file with the actual cart math, payment-split validation, stock-aware quantity logic, and customer picker every prior phase has audited. **This task must not change a single line of logic, state, handler, or validation — only `className` strings and the two token migrations named below.**

- [ ] **Step 1: Record current behavior before touching anything**

Before editing, run the app and exercise `CheckoutForm.tsx`'s current behavior directly (not from memory of the code): add a product and a service to the cart, apply a discount, split payment across cash + MTN Mobile Money + Orange Money with a reference code on the mobile-money lines, pick a customer then clear it back to walk-in, and complete a sale. Note the exact resulting total/stock-decrement/sale record. This is the baseline Step 4 verifies against — a real before/after, not an assumption of "should be unchanged."

- [ ] **Step 2: Restyle `CheckoutForm.tsx`**

Read the full file first (295+ lines, not fully captured during investigation). Apply this mapping consistently across every matching className string in the file:

| Pattern | Before | After |
|---|---|---|
| Card/section containers | `rounded-md` (bare, on a bordered/padded container) | `rounded-2xl` + `shadow-[var(--shadow-card)]` + `bg-surface` (large radius, soft shadow, elevated white card, per the brief's card guidance) |
| Buttons — primary (e.g. "Complete sale") | existing `bg-marine ...` classes | keep `bg-marine`, update radius to `rounded-lg`, ensure `transition-colors duration-200`, medium height (`py-2.5` if not already) |
| Buttons — secondary/outline | existing bordered button classes | `rounded-lg border border-mist ... hover:border-marine` pattern, matching the new shell buttons from Task 2 for consistency |
| Buttons — danger (e.g. remove line item) | existing danger-colored classes | swap to `text-danger`/`hover:bg-danger/10` using the Task 1 token (was likely a bespoke red before — confirm and migrate) |
| Line-item / totals table | existing table classes | `divide-y divide-mist` row separators, `text-slate` uppercase muted header cells if headers exist, `font-mono` + `text-right` on every numeric cell (price/qty/line-total/subtotal/discount/total) — confirm `font-mono`/`text-right` aren't already applied inconsistently and make them uniform |
| Inputs (quantity, discount, payment amount, reference code) | existing input classes | `rounded-lg border border-mist ... focus:` ring using `marine`, comfortable height (`py-2` minimum) |
| **`orange_money: 'bg-tender-orange text-ink'` (line ~45)** | `bg-tender-orange text-ink` | `bg-info text-ink` *(or verify against the actual rendered payment-method badges — this may need `text-white` instead of `text-ink` for contrast against `bg-info`'s darker blue; check contrast visually in Step 4, adjust if `text-ink` reads poorly)* |
| **Mobile-money reference-code advisory banner (line ~315)** | `rounded-md border border-tender-orange bg-tender-orange/10 px-3 py-2 text-sm text-ink` | `rounded-lg border border-info bg-info/10 px-3 py-2 text-sm text-ink` |
| Badges (e.g. a payment-method or status badge, if present) | existing badge classes | `rounded-full` pill shape, soft muted background (`bg-{color}/10 text-{color}`) |

The `orange_money` color-mapping object (line ~45) is a *styling* lookup keyed by payment method — confirm this is genuinely just a className string keyed by an existing enum value, not business logic, before touching it (it should be: the payment method itself, its validation, and its persistence are unrelated to which Tailwind class renders its badge).

- [ ] **Step 3: Restyle `QueuedSaleReceipt.tsx` and `pos/page.tsx`**

`QueuedSaleReceipt.tsx`'s reference-code banner gets the identical `tender-orange`→`info` migration as Step 2's second row (same exact old/new className string, confirmed identical in the investigation). Apply the same card/radius/shadow treatment as Step 2 to any card-like container in this file.

`pos/page.tsx`'s only styling is its `<h1>` (`font-display text-xl font-semibold text-ink`, already token-driven and unchanged) and the outer `mx-auto mt-12 max-w-4xl space-y-6` wrapper — leave the wrapper as-is unless it visibly conflicts with `CheckoutForm.tsx`'s new card treatment in Step 4's check (e.g. if cards now have their own shadow/padding, the page wrapper's `space-y-6` should still read as reasonable spacing between them — verify, don't assume).

- [ ] **Step 4: Verify identical behavior against the Step 1 baseline**

Re-run the exact same sequence from Step 1: same product/service, same discount, same three-way payment split with a reference code, same customer-picker sequence (pick then clear to walk-in). Confirm: identical total, identical stock decrement, identical sale record shape, identical validation behavior (try an invalid payment split that shouldn't sum to the total — confirm it's still rejected the same way; try a backorder scenario if stock allows — confirm it still requires a customer). This is not a visual-only check — it specifically re-exercises the business logic this task promises not to have touched.

Also confirm visually: cards show the new large-radius/soft-shadow treatment, the orange-money badge and reference-code banners read clearly with the new `info` blue (adjust `text-ink`→`text-white` on the badge if Step 2's contrast note applies), numeric columns are right-aligned and monospace, buttons/inputs match the new soft-rounded treatment, mobile viewport still works, `Tab` through the form shows visible focus rings throughout.

- [ ] **Step 5: Commit**

```bash
git add src/components/pos/CheckoutForm.tsx src/components/pos/QueuedSaleReceipt.tsx "src/app/(dashboard)/pos/page.tsx"
git commit -m "style(pos): restyle checkout for the new design system, zero behavior change"
```

---

## Task 4: Completion report

**Files:**
- Create: `docs/superpowers/plans/2026-07-12-phase-21-design-system-replacement-completion.md`

- [ ] **Step 1: Final whole-surface check**

Run `npm run dev`, walk through the shell (both persistent and mobile-drawer sidebar variants) and the full checkout flow one more time end to end. Confirm no regressions introduced across Tasks 2-3 combined (e.g. a shared class-name pattern touched in both tasks staying consistent between shell and POS).

- [ ] **Step 2: Write the completion report**

State plainly, per this project's standing completion-report format: what changed structurally (radius/shadow/spacing/component treatments — Tasks 2-3) vs. cosmetically (color/typography token values — Task 1), the two flagged judgment calls from this plan's token-value section (all-four-semantic-colors-updated, `tender-orange` retirement) and whether they held up on review, confirmation that the Task 3 before/after behavior check (Step 1 vs Step 4) found zero differences, and explicit confirmation that no screen outside the two in-scope surfaces received structural changes (only the accepted global color/typography cascade). Name the next tranche exactly as the brief's own scope section implies: products/services/suppliers/stock and customers/staff/departments/branches (mirroring Phases 10/11's original two-wave rollout), plus everything styled since (roles/settings/HR/reports/clinical/messaging/seminars) — none scoped yet, explicitly deferred to follow-up phases once this one is reviewed and approved.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-12-phase-21-design-system-replacement-completion.md
git commit -m "docs: Phase 21 completion report — design system replacement (tokens + shell + POS)"
```

---

## Self-Review

**Spec coverage:** Investigation requirement ✓ (done and reported before this plan, findings section above). New tokens (background/cards/text/borders/semantic colors) ✓ Task 1. Both brand accents preserved in role ✓ (marine/brass hex values explicitly unchanged in Task 1). Typography (Inter everywhere, JetBrains Mono numeric-only) ✓ Task 1. Shell reflects new system ✓ Task 2. POS/checkout reflects new system ✓ Task 3. Identical checkout behavior, verified not assumed ✓ Task 3 Steps 1+4. Responsive/focus/reduced-motion ✓ Global Constraints + Task 2/3 manual checks (reduced-motion itself needs no code change, already global). Completion report on structural-vs-cosmetic change ✓ Task 4. Explicitly out of scope, named not dropped: every other screen (Task 4's report names the next tranche).

**Placeholder scan:** The Task 2 Sidebar mapping table and Task 3 CheckoutForm mapping table both flag "read the full file first, this table isn't exhaustive" rather than pretending to enumerate every className in a 200+/300+ line file sight-unseen from a partial investigation read — this is an honest scope note, not a placeholder, and each table gives the implementer the *pattern* to apply consistently plus every specific line actually confirmed during investigation (the `tender-orange` call sites, the exact container/button/header strings read directly).

**Type consistency:** No new props, types, or function signatures introduced anywhere in this plan — every task is a pure restyle, so there's nothing to drift between tasks. The one new named CSS custom property (`--shadow-card`) is introduced once in Task 1 and referenced identically (`shadow-[var(--shadow-card)]`) in both Task 2 and Task 3.
