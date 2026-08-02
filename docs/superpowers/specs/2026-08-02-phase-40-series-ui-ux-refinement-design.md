# Phase 40 Series: Full System Front-End UI/UX Refinement & Polishing — Design

**Date:** 2026-08-02
**Status:** Approved by user, pending spec self-review
**Resolves:** `docs/tech-debt.md` TD-6 (design-primitive rollout gap)

## Background

TD-6 (flagged Phase 38.6) identified seven modules that still render with the
pre-Phase-38.1 raw-Tailwind pattern, never having adopted the six shared
design primitives (`Button`/`Card`/`Badge`/`PageHeader`/`StatSummary`/`FormSection`)
that the rest of the app (Dashboard, POS/Checkout, Stock, Products, Sales Log,
Login) now uses consistently:

- Roles & Permissions
- Seminars (list + detail)
- Clinical-record sections of the customer detail page
- Messaging
- Accounting (Expenses / P&L)
- Payroll
- Reports (Sales / Inventory / P&L — Expenses' own list page is its only
  report view, no separate route exists)

TD-6 was deliberately deferred pending its own scoped phase rather than being
folded into an unrelated task. This spec is that phase — or rather, that
*series* of phases, following this project's established practice of keeping
each design-rollout change to a reviewable size (Phase 26+26.1, Phase 27,
Phase 34, the 38.1–38.6 series).

Separately, the user asked that this initiative make deliberate use of the
UI/UX-oriented skills available in Claude Code (`frontend-design`,
`impeccable`, the `ui-ux-pro-max` suite, `dataviz`), not just re-run the
mechanical primitive-swap pattern by rote.

## Scope Decision

Confirmed with the user directly:

1. **Both mechanical rollout and creative polish** — the six modules other
   than Reports get the same zero-color/font-change mechanical primitive
   rollout every prior design-rollout phase (10, 21, 22, 27, 28, 33, 34) has
   used. **Reports additionally gets genuine creative polish**, including new
   data visualizations, not just primitive adoption.
2. **Verification gaps stay separately tracked, not folded in.** Phase 38.5's
   outstanding screen-reader manual-check request and the `resize_window`
   tool failure (Phases 24, 36, 38 — confirmed broken each time via
   independent `window.innerWidth` checks) remain named, carried-forward gaps.
   Each phase in this series still gets manual mobile verification per Phase
   38.4's precedent; no phase in this series is dedicated to fixing the
   tooling itself.
3. **Domain-grouped phases**, not one-phase-per-module or one giant phase —
   matches this project's own sizing precedent.
4. **Reports creative polish includes adding real charts** via the `dataviz`
   skill — Sales/Inventory/P&L reports currently render as tables and summary
   totals with no visualization (only the Dashboard's `RevenueTrendChart`
   has one today).

## Phase Breakdown

| Phase | Scope | Rationale |
|---|---|---|
| **40** | Roles & Permissions + Seminars (list + detail) | Both small, self-contained admin screens — mirrors Phase 34's existing pairing of exactly these two modules |
| **40.1** | Clinical-record sections of the customer detail page | Kept isolated from other modules — patient-data-adjacent code inside an already-heavily-audited file (`customers/[id]/page.tsx`), warrants the same care Phase 28's clinical design rollout used |
| **40.2** | Messaging (conversation list + thread view) | Standalone subsystem, no natural pairing with the rest of TD-6's list |
| **40.3** | Accounting + Payroll | Mirrors the existing Phase 26 / 26.1 pairing — same `finance_admin`-facing domain |
| **40.4** | Reports — mechanical primitive rollout (Sales, Inventory, P&L; 4 pages total) | Primitive adoption only, kept separate from the creative work so a bad chart-design call in 40.5 doesn't block or entangle with this phase |
| **40.5** | Reports — creative polish + new charts | New visual/creative work: chart additions via `dataviz`, layout and motion polish. Isolated from 40.4 so each phase stays independently revertable |
| **40.6** | Whole-branch consistency audit | Closing pass across all of 40–40.5, matching Phase 10's "drift between independently-styled screens" check and Phase 38.6's whole-branch consistency audit. **This is the phase that marks TD-6 resolved** — TD-6 stays open until 40.6 confirms zero raw-Tailwind holdouts across all seven original modules |

Every phase follows this project's standard closing sequence: live UAT
against real `erp-lfd` data (test-account provisioning → dev server → user
confirms → cleanup), a completion report, and a `phase-40.N-baseline` tag
only on explicit request — no phase in this series changes that established
workflow.

## Skill-to-Phase Mapping

**Every phase (40–40.6), baseline:**
- **`verify`** — this project's live-verification practice against real
  `erp-lfd` data through the real HTTP/browser surface, never the emulator.
  Mandatory per the established UAT-wrapup sequence.
- **`run`** — launch the dev server to actually exercise the change before
  claiming it's done.
- **`claude-in-chrome`** — used for live visual diffing/screenshots where it
  connects. This repo has a documented history of browser-automation
  connection failures (Phase 26) and a `resize_window` tool that has failed
  identically in Phases 24, 36, and 38 — treat both as "attempt it, fall back
  to manual/Maxim-driven verification," the same accepted pattern already in
  use, not a new risk introduced by this series.

**Phases 40, 40.1, 40.2, 40.3, 40.4 (mechanical rollout):**
- **`impeccable`**, used lightly — audit mode only, for a per-phase
  consistency/accessibility spot-check (spacing, hierarchy, anti-patterns).
  Not its design or critique modes — no new aesthetic decision is being made
  in these phases.
- `frontend-design` **not used** — nothing new is being designed, existing
  primitives are being re-parented in, matching the zero-color/font-change
  discipline of every prior mechanical rollout phase.
- 40.1 and 40.2 carry extra weight on `impeccable`'s accessibility checks
  specifically: 40.1 touches patient-data-adjacent code, and 40.2 touches
  `ThreadView.tsx`, which already carries Phase 38.5's `aria-live` fixes — a
  regression there would undo real, already-shipped accessibility work.

**Phase 40.5 (Reports creative polish + charts):**
- **`dataviz`** — primary skill for this phase, read before writing any
  chart code. Its chart-type/form heuristics and color-formula validator are
  constrained to this project's *existing* locked design tokens
  (marine/brass/mist/slate/success/danger from the Phase 21/24 CECDE
  reconciliation) — this phase does not introduce a new palette.
- **`frontend-design`** — for layout/aesthetic decisions integrating charts
  into each report page, guarding against a templated/generic look.
- **`impeccable`** — polish pass: hover/tooltip motion, responsive chart
  behavior, empty/error/zero-data states, copy.
- **`ui-ux-pro-max`** (main skill + `design-system`) — reference database for
  chart-type selection and motion presets only, same token constraint as
  `dataviz` above: it does not get to introduce its own color or font
  recommendations into an already-decided design system.

**Phase 40.6 (consistency audit):**
- **`impeccable`** — primary skill, audit/critique mode across the whole
  40–40.5 diff, matching Phase 10's and Phase 38.6's whole-branch precedent.
- **`frontend-design`** — secondary, aesthetic-coherence confirmation only.

**Explicitly excluded, and why:** `banner-design`, `brand`, and `slides`
(marketing collateral / logo / social-banner / HTML-deck skills) don't fit an
internal ERP report page — including them would be scope creep, not
coverage. `ui-styling`'s shadcn-specific guidance (`shadcn-components.md`,
`shadcn_add.py`, theming scripts) is also excluded — CLAUDE.md already
recorded the explicit, reviewed decision to stay off shadcn/ui; this series
does not revisit that decision.

## Constraints

- Phases 40–40.4 and 40.6: zero color/font/token changes. Only Phase 40.5
  introduces new visual content, and even there, new content must fit inside
  the existing token system, not extend or replace it.
- No phase in this series touches `api/sales/route.ts`'s reporting math or
  any other already-audited business-logic file — this is a rendering-layer
  initiative only. If a mechanical rollout phase surfaces a genuine
  data/logic bug in a file it's already touching, fix it in that phase and
  say so in the plan and completion report, per this project's standing
  known-issues policy; do not go out of scope chasing it elsewhere.
- Each phase's diff should stay reviewable — if a phase's scope turns out
  larger in practice than expected (e.g., 40.5's chart work), split it
  further rather than let a single phase's diff balloon.

## Out of Scope

- Fixing the `resize_window` tool itself (tracked, unresolved since Phase 24).
- Phase 38.5's outstanding screen-reader manual-verification request.
- Any new business feature or data model change.
- Revisiting the shadcn/ui decision.
- TD-4, TD-5, TD-7 (unrelated tech debt).

## Success Criteria

- All seven TD-6 modules use the six shared primitives, confirmed by the
  same grep-for-imports method Phase 38.6 used to originally identify the gap.
- Reports pages have real, working data visualizations that respect the
  existing token system and pass the same WCAG AA bar (contrast, focus
  states, `prefers-reduced-motion`) already established elsewhere in the app.
- Phase 40.6's whole-branch audit finds zero unresolved Critical/Important
  findings, matching the bar every prior phase in this project has been held
  to.
- TD-6 in `docs/tech-debt.md` is marked resolved, referencing Phase 40.6.

## Next Steps

This document is the series-level roadmap, not a single implementation plan.
Each phase (40, 40.1, 40.2, 40.3, 40.4, 40.5, 40.6) gets its own
`docs/superpowers/plans/` entry, written via the `writing-plans` skill and
executed independently with its own review/UAT/completion-report cycle,
starting with Phase 40 (Roles + Seminars).
