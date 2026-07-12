# Phase 21 — Design System Replacement (Tokens + Shell + POS) — Completion Report

**Date:** 2026-07-12
**Plan:** `docs/superpowers/plans/2026-07-12-phase-21-design-system-replacement.md`

## Summary

Phase 9's design system (marine/brass on Space Grotesk/IBM Plex, warm off-white neutrals) is replaced with a new system (marine/brass kept in their exact existing roles, Inter/JetBrains Mono, cool Slate-gray neutrals), on the exact two surfaces Phase 9 originally covered: the navigation shell and POS/checkout. Zero behavior changes anywhere — every diff line across all four tasks is a className string, except two explicitly authorized color-token migrations in Task 3, both independently verified.

**6 files changed, 70 insertions / 71 deletions, across 4 commits** (plus one fix-and-re-review cycle): `src/app/globals.css`, `src/app/layout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/NavShell.tsx`, `src/components/pos/CheckoutForm.tsx`, `src/components/pos/QueuedSaleReceipt.tsx`. `src/app/(dashboard)/pos/page.tsx` was in scope but required zero changes — its only styling (the page `<h1>`) was already fully token-driven.

## What changed structurally vs. cosmetically

**Cosmetic only (Task 1, `globals.css`/`layout.tsx`):** every color value and typeface swapped — background `#f8fafc`, cards `#ffffff` (new `--color-surface` token), primary text `#0f172a`, secondary text `#475569`, borders `#e2e8f0`, `success`/`danger`/`warning`/`info` all set to standard Tailwind 600-weight shades, marine (`#0f5c66`) and brass (`#c08a28`) held byte-identical to their Phase 9 values. Inter replaces Space Grotesk + IBM Plex Sans everywhere (`font-display` and `font-sans` both now resolve to Inter — the display/body distinction is retired, per the brief's "Inter everywhere"); JetBrains Mono replaces IBM Plex Mono. This is a shared-file change: because zero components anywhere hardcode color/font values (confirmed by a repo-wide scan before planning), every one of the ~48 already-styled files inherited the new palette/typography immediately, as an accepted structural consequence of the shared token system — confirmed and approved by the user before implementation began.

**Structural (Tasks 2-3, the shell and POS components):** radius (`rounded-md`→`rounded-lg` on shell/inputs/buttons, `rounded-2xl` on POS cards), a new bespoke `--shadow-card` token (keyed to `--color-ink` rather than pure black, replacing the shell's generic `shadow-xl`), spacing modestly opened up (`gap-1`→`gap-1.5`, `py-2`→`py-2.5`, sidebar padding `p-4`→`p-5`), transitions standardized to `duration-200`, the header and persistent sidebar made `sticky`, numeric table cells made uniformly `font-mono text-right`, and the two `tender-orange` call sites (the Orange Money badge, the mobile-money reference-code advisory banner) migrated to the new `info` token — the only non-className changes in the entire phase, both independently verified as correctly reasoned (see below).

## The two flagged judgment calls from the plan

1. **All four semantic colors updated, not just the two new ones.** Held up on review — no finding challenged this.
2. **`tender-orange` retired, migrated to `info`.** Held up, with one refinement caught during implementation: the plan's literal `text-ink` badge-text value was recomputed against the new `bg-info` background and found to fail WCAG AA contrast (3.454:1, below the 4.5:1 threshold for 14px text) — changed to `text-white` (5.169:1, passes). This is exactly the kind of judgment call the plan authorized ("use your judgment and state your reasoning") rather than a deviation from it; the Opus reviewer independently recomputed the same luminance values and confirmed both the arithmetic and the conclusion.

## Verification

**Code-level verification was thorough and is fully documented; live/interactive verification was not possible this session and remains outstanding.**

Browser automation (Claude in Chrome) was unreachable throughout — for the controller and every subagent, across multiple attempts, including after the user confirmed the extension should be connected. Per the user's explicit direction, the phase proceeded on code-level review alone, with the understanding that live visual/interaction verification happens afterward, before this phase is considered fully done in practice (not just in review).

In place of live testing, Task 3 (the highest-stakes task — `CheckoutForm.tsx`'s cart math, payment-split validation, stock-aware quantity logic, customer-picker behavior) used a pre-edit logic/state catalog: every `useState`, derived value, handler, and JSX conditional in the file was cataloged *before* any edit, then the post-edit diff was checked line-by-line against that catalog. The Opus reviewer independently rebuilt this catalog from scratch (not trusting the implementer's version) and confirmed all 13 `useState` hooks, every derived value (`subtotal`/`discount`/`total`/`paymentsSum`/`balanceDue`/`submitDisabled`), every handler (including the offline-queue/idempotency-key/`POST /api/sales` path), and every JSX conditional are byte-identical to before — zero of the 40 changed lines in that file fall outside a className string or the two authorized token migrations. Task 2's shell restyle diff was similarly confirmed className-only by direct full-file reads (not diff-only) at both the initial review and the fix re-review.

**What still needs a human pass, before this phase is truly done:** log in and click through the shell (both persistent-sidebar and mobile-drawer variants — confirm the sticky-sidebar fix actually keeps the sidebar pinned while scrolling, hover/active nav states, focus-visible outlines, sign-out), and run a real checkout (add a product and a service, apply a discount, split payment across cash/MTN/Orange Money with a reference code, pick then clear a customer, complete the sale) to confirm the restyle reads correctly and, as the code-level review already predicts, behaves identically to before.

## One real fix-and-re-review cycle

Task 2's initial review found one Important, code-verifiable finding: `sticky top-0` had been applied to the mobile drawer branch (inert — already `position: fixed` via its wrapper) instead of the persistent desktop/tablet sidebar branch (which actually needed it), due to the plan's own mapping-table row labels being swapped relative to the component's actual branch logic. Fixed with an isolated 2-line swap, re-reviewed and confirmed correct directly against the current source, not just the diff.

## Commits

| Commit | Task |
|---|---|
| `99f106d` | Task 1 — tokens + typography |
| `b880bc6` + `70c0674` (fix) | Task 2 — shell restyle |
| `29c2120` | Task 3 — POS/checkout restyle |

## Next tranche (explicitly out of scope this phase, per the phase's own boundary)

Products/services/suppliers/stock and customers/staff/departments/branches (mirroring Phases 10/11's original two-wave rollout), plus everything styled since — roles, settings, HR, reports, the clinical module, messaging, seminars — none scoped yet, all deliberately deferred to follow-up phases once this one is reviewed and approved. Every one of those ~48 files already inherited the new colors/typography as a side effect of Task 1's global cascade; none of them received the structural (radius/shadow/spacing/component-treatment) polish this phase gave the shell and POS.
