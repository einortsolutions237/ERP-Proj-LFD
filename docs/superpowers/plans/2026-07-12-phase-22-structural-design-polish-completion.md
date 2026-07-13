# Phase 22 — Structural Design Polish (Catalog, Inventory, CRM & Core Admin) — Completion Report

**Date:** 2026-07-13
**Plan:** `docs/superpowers/plans/2026-07-12-phase-22-structural-design-polish.md`

## Summary

Phase 21's structural conventions (large-radius soft-shadow cards, `duration-200` transitions, monospace/right-aligned numeric cells) applied to the eight entity types Phases 10 and 11 originally styled: products, services, suppliers, stock, customers, staff, departments, branches. **25 of the 41 in-scope files changed** (98 insertions/98 deletions across the 8 entity tasks, plus a 3-file cosmetic normalization pass); the other 16 were thin wrapper pages with nothing matching the mapping table — confirmed by direct read in every task, not assumed.

Zero Critical/Important findings across all 8 task-level reviews (Task 4/Stock reviewed at Opus tier, matching Phase 10's own risk-tiering).

## Exit criteria

- **All eight entity types reflect the new conventions** — confirmed. Zero `rounded-md` remains anywhere in the 41 in-scope files except one deliberate exception: the "Upcoming appointments" section inside `customers/[id]/page.tsx`, which is clinical-wall-gated (`clinical.appointments.manage`) and correctly out of this phase's scope despite sharing a file with the in-scope Purchase History section.
- **Zero color or font value changes** — confirmed both per-task (every reviewer independently scanned for this) and in a final whole-phase diff scan: every token appearing in the diff is either a pre-existing color/font value riding along on a line that also changed a radius/duration token, or the reviewed `font-mono text-right` numeric-cell additions (a structural convention per the mapping table, not a color/font change).
- **Behavior preservation** — confirmed per-task with named risks tracked to zero regressions: SKU-adjacent delete (Products), no stock/SKU concept (Services), the supplier delete-guard's error path (Suppliers, confirmed outside the diff), stock transaction math + the Phase 12 `row.branchId` threading including the transfer destination-exclusion logic (Stock, Opus-verified via independent catalog reconstruction), TD-3's delete guard + the clinical-section scope boundary (Customers — the trickiest boundary in the phase, held precisely under independent verification), `isBranchLocked` read-scoping (Staff, Departments — Departments also had an unnamed second ownership guard the implementer found independently and the reviewer confirmed).
- **Stock got the higher review tier** — confirmed, Opus-tier review, zero Critical/Important.
- **Whole-branch consistency pass** — done. One real drift found: 3 of 8 entity tables (Staff/Departments/Branches, the later tasks) had their card-wrapper `bg-surface`/`shadow-[var(--shadow-card)]` classes in reversed order relative to the other 5 and the original Phase 21 `CheckoutForm.tsx` precedent — cosmetic only, zero functional/rendered effect (Tailwind class order doesn't matter), normalized to the majority order in a dedicated 3-file commit (`192f15a`).
- **Live verification** — not possible this session; browser automation remained unreachable (consistent with Phase 21's experience), and the dev server started for manual verification during this session died mid-session (exit 127) for reasons not investigated further given this phase's scope. Code-level verification was unusually thorough instead: every task's diff was independently re-verified by a fresh reviewer against the actual current file contents (not just the diff), with the two highest-risk tasks (Stock, Customers) getting line-by-line/section-boundary verification specifically because a live check wasn't available to catch what code review might miss. **This remains a real, named gap** — a human click-through of all eight entities (and the still-outstanding Phase 21 shell/POS walkthrough) hasn't happened yet.

## One process note

A Task 5 (Customers) implementer dispatch was interrupted mid-task by a transient session usage limit; no code had been written or committed, so the retry started clean with zero lost work or duplication.

## Commits

| Commit | Task |
|---|---|
| `bbfbdf8` | Task 1 — Products |
| `1177aed` | Task 2 — Services |
| `9dbea59` | Task 3 — Suppliers |
| `28ec705` | Task 4 — Stock (Opus review) |
| `e3fb8bf` | Task 5 — Customers |
| `650b1af` | Task 6 — Staff |
| `1a4d026` | Task 7 — Departments |
| `72e4fe0` | Task 8 — Branches |
| `192f15a` | Task 9 — cross-entity class-ordering normalization |

## Next tranche (explicitly out of scope this phase, per the phase's own boundary)

The clinical module, messaging, HR, reports, roles, settings — none of these were ever part of the original Phase 9-11 design rollout and none were touched here. The appointments section inside `customers/[id]/page.tsx` (clinical-wall-gated) remains on the old `rounded-md` convention and would need its own phase, alongside whichever phase eventually restyles the rest of the clinical module.
