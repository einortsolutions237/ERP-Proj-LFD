# Phase 11 — Design Rollout: CRM & Core Admin — Completion Report

Plan: `docs/superpowers/plans/2026-07-04-phase-11-design-crm-core-admin.md`
(sent for review in chat, approved as proposed — including the two explicit
judgment calls: leave `StaffForm`'s `branchId` gap untouched, and flag all
three read-scoping asymmetries (stock/staff/departments) without fixing
any of them — then executed via subagent-driven-development: 4 tasks, one
implementer + one task reviewer each, plus one final whole-branch review.)

## Commits

| Task | Entity | Commit | Files | Lines | Reviewer tier |
|---|---|---|---|---|---|
| 1 | Customers | `68d5d8b` | 7 | +112 / -82 | Sonnet |
| 2 | Departments | `8f1c561` | 5 | +61 / -40 | Sonnet |
| 3 | Branches | `688a23b` | 5 | +78 / -48 | Sonnet |
| 4 | Staff | `2fa61b4` | 5 | +144 / -70 | **Opus** |
| **Total** | | | **22** | **+395 / -240** | |

Base: `16b61ae` (head of Phase 10 work, current `main` tip at phase start).
Head: `2fa61b4`. Working directly on `main`, no worktree — matches every
prior phase's pattern.

## Route files — confirmed untouched (not just claimed)

`git diff --stat 16b61ae..2fa61b4 -- src/app/api` returns nothing — zero
lines. Explicitly checked and absent from the full-phase diff, at every
task review and again at the final whole-branch review:
`src/app/api/customers/route.ts`, `src/app/api/customers/[id]/route.ts`,
`src/app/api/staff/route.ts`, `src/app/api/staff/[staffId]/route.ts`,
`src/app/api/departments/route.ts`, `src/app/api/departments/[id]/route.ts`,
`src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`.

## Behavior preservation

Every task reviewer (Sonnet for Customers/Departments/Branches, Opus for
Staff given `super_admin`/Phase-8 adjacency) traced its diff against the
brief's "Do NOT change" bullets and found zero logic drift — same fetch
calls and payload shapes, same validation, same conditional-rendering
conditions, same state variables. The final whole-branch review
independently re-verified the whole phase:

- Customer phone-uniqueness, the org-wide customer/department/branch data
  model, and Phase 8's branch-targeting logic all live in the untouched
  route files, so this phase could not have altered them.
- The customer detail page's branch-scoped sales query
  (`where('customerId', ...).where('branchId', '==', user.branchId)`) and
  its field-by-field, never-spread `PurchaseRow` construction are
  unchanged.
- `StaffForm.tsx`'s `isSuperAdminTarget` branching (disabled input vs.
  select, for both Role and Employment status) and its explanatory copy
  are byte-identical; only the disabled input's `bg-gray-100` →
  `bg-mist/40` class changed.
- `StaffTable.tsx`'s `super_admin` Delete-guard survives in **both**
  places it existed before: the early-return inside `handleDelete` and
  the `disabled` prop on the button.
- `staff/[staffId]/page.tsx`'s branch-mismatch-as-404 privacy check and
  the `toDateInputValue` Timestamp-normalization helper are untouched.
- **`StaffForm.tsx` still has no `branchId` field anywhere** — confirmed
  by grep across the full phase diff and against the current file. The
  Phase 8 backend capability (an explicit target branch for non-branch-
  locked roles) remains unwired to any UI, exactly as approved going in.
- **The three read-scoping asymmetries are present and unchanged, not
  accidentally "fixed."** `staff/page.tsx:16` and `departments/page.tsx:16`
  both still carry an unconditional `where('branchId', '==',
  user.branchId)` against Firestore directly, bypassing their sibling API
  routes' Phase 8 `isBranchLocked()` fix — this phase newly discovered
  the staff and departments instances (only the stock instance was known
  before, flagged in Phase 10); all three are now recorded together below.
  `branches/page.tsx`'s unfiltered read remains genuinely correct as-is
  (branches carry no `branchId` field of their own) and was not touched
  in a way that would make it otherwise.

## Cross-task consistency

Because each task was implemented by an independent subagent from a
shared brief, the final whole-branch review specifically checked for
drift the four task-scoped reviews couldn't see, by extracting the
actual class strings used for each shared primitive across all four
tasks' files. Result: a single, byte-identical string per primitive
everywhere it was supposed to be shared —

- Primary button: `rounded-md bg-marine px-3 py-2 text-paper
  transition-opacity disabled:opacity-50` — one variant across all 4
  forms and every page-level "Add ___" CTA.
- Table header cell: `px-3 py-2 text-left text-xs font-medium
  uppercase tracking-wide text-slate` — one variant across all 5 tables
  (including the customer detail page's purchase-history table).
- Status pill (Departments/Branches/Staff): `bg-success/10 ... text-success`
  / `bg-slate/10 ... text-slate` — identical strings, active/inactive
  only (Customers has no status field, correctly has no pill).
- Error text (`text-sm text-danger`) and the table wrapper/header/row/
  cell classes: consistent everywhere.

The one class variance found — text inputs carry `placeholder:text-slate`
while `<select>` elements omit it — is a justified difference (selects
have no placeholder), not drift, and the final reviewer confirmed it as
such rather than flagging it.

This phase's two genuinely new patterns stayed exactly as scoped and did
not leak elsewhere: the read-only key-value detail block (Customers only
— Staff/Departments/Branches correctly keep their combined detail+edit
form with no separate read-only view, since that's the shape those three
already had) and Staff's fieldset/legend + temp-password reveal card
(both one-off, confirmed not half-applied anywhere else).

No new design tokens were invented; every color/font class traces to an
existing `--color-*`/`--font-*` definition in `globals.css`. No new
shared component library was introduced (`src/components/ui/` still
doesn't exist). The global `:focus-visible` rule was not overridden
anywhere.

## The two judgment calls, and how they held up

1. **`StaffForm`'s branch-targeting gap.** Approved going in to leave
   untouched rather than add a `branchId` picker, since that would be new
   functionality (a product decision on which roles see it, default
   behavior, labeling) gated behind this phase's own "behave identically
   to before" exit criterion. Held throughout: zero `branchId` references
   were added anywhere in the phase diff, confirmed independently by the
   Staff task reviewer (Opus) and the final whole-branch reviewer.
2. **The read-scoping asymmetry, now 3-for-3.** Phase 10 had flagged only
   the stock instance. Researching this phase's scope surfaced two more
   — `staff/page.tsx` and `departments/page.tsx` — both querying
   Firestore directly with an unconditional branch filter, never having
   inherited their sibling API routes' Phase 8 org-wide fix. All three
   are now recorded together as a single pattern (list pages built as
   direct Firestore reads that quietly diverged from their API route)
   rather than being fixed piecemeal or left to look like isolated
   incidents. None was touched this phase — confirmed unchanged at every
   review layer.

## Self-critique per screen

- **Customers** — the one screen genuinely doing something new: the
  read-only key-value detail page has no Phase 9/10 precedent to mirror,
  so its label/value color split (`text-slate`/`text-ink`) and the
  decision to keep Edit/Delete as page-level actions rather than table-row
  actions were judgment calls made fresh this phase, not inherited. Reads
  as intentional because it was checked against the plan's explicit
  call-out of "first genuine detail page," not just assumed fine.

- **Departments** — the cleanest mirror this phase: same shape as
  Products (Name/Status/actions, combined detail+edit), reviewer confirmed
  byte-for-byte class matches against the Products reference including
  the pill markup. Zero surprises, which is exactly what a "simple, no
  new pattern" entity should produce.

- **Branches** — nearly identical to Departments in shape and risk
  profile; the one thing worth noting is that this is the only entity in
  the whole app that is genuinely, correctly unfiltered with no
  `branchId` concept at all (a branch document IS the branch) — the
  implementer and reviewer both had to actively confirm the *absence* of
  any branch-scoping logic was correct, not an oversight, the same kind
  of "prove a negative" check Suppliers needed in Phase 10.

- **Staff** — the highest-stakes screen this phase, and the one that
  earned the most scrutiny at every layer (Opus task review, called out
  by name in the final review). Three things converge here that don't
  exist anywhere else in the app: `super_admin` protections with two
  independent guards (StaffTable's early-return + disabled prop), the
  `isSuperAdminTarget` disabled-input-vs-select branching in the form,
  and now — newly documented, not newly created — a real, unresolved gap
  between what the Phase 8 backend supports (explicit branch-targeting on
  create) and what the UI has ever exposed (nothing). The restyle itself
  was mechanical and clean, but the judgment call under it — deciding
  *not* to close that gap as part of a "presentation-only" phase — is the
  one decision in this report worth a future phase revisiting
  deliberately, as a real feature scope question, not a bug fix.

## Live/browser verification

Not performed this phase, for the same reason Phase 10 skipped it: the
diff is a mechanical className/JSX-wrapper swap around unchanged logic,
confirmed by `tsc --noEmit` (clean on all 4 commits) plus two independent
rounds of diff-tracing review (per-task, then whole-branch). Phase 9's
live-verification precedent is reserved for phases introducing new
interactive behavior; this phase introduces none — the closest thing to
new behavior, the temp-password reveal card and the read-only detail
page, are both static-rendering changes with no new state or event
handling. Flagging this explicitly rather than silently skipping a step
Phase 9 did perform.

## Final whole-branch review verdict

**Ready to merge: Yes.** Zero Critical or Important findings across all
four task reviews and the final whole-branch review. One Minor,
non-blocking note from the final review (the text-input vs. `<select>`
class variance, correctly judged as justified rather than drift) — no
action needed. The two flagged, out-of-scope items (the `StaffForm`
branch-targeting gap, and the 3-for-3 read-scoping asymmetry) are
recorded above for a future phase to pick up as real decisions.
