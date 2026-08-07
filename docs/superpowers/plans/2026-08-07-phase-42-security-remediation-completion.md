# Phase 42 (Security Remediation) — Completion Report

**Date:** 2026-08-07
**Plan:** `docs/superpowers/plans/2026-08-06-phase-42-security-remediation.md`
**Executed via:** Subagent-Driven Development (fresh implementer + task reviewer per task), tracked in `.superpowers/sdd/2026-08-06-phase-42-security-remediation/progress.md`
**This report covers:** Steps 1, 3, 4, 5 of the wrap-up task only (Step 2, live verification, and Step 6, tagging, are explicitly out of scope for this task — see below).

## What shipped

Five findings from an external security code audit, closed:

| Finding | What | Commit(s) |
|---|---|---|
| H-1 | `/api/auth/session` strict-role bypass + unthrottled session mint | `b69ce14` |
| H-2 | 10 hardcoded `branch_manager` branch-scoping checks (not 4) | `cc728eb`, `90bebec` (fix round) |
| M-1 | Attachment IDOR (cross-branch read) + upload hardening (magic bytes, filename sanitization) | `2131a48`, `9242e1b` (fix round) |
| M-2 | Missing security response headers, CSP report-only | `2e28611` |
| H-3 | Dependency advisories (`next`, `fast-xml-parser`, `brace-expansion`; `firebase-admin` documented-accepted) | `523f080`, `04baa80` (fix round) |

M-7 (a committed private key in `.env.test`) was confirmed correctly out of scope per the original audit document's own note — a separate, unrelated two-minute fix, not part of this phase. Full technical detail for each finding is now in `CLAUDE.md`'s own Phase 42 section; this report focuses on process, review findings, and verification.

## The corrected H-2/H-3 scope, and why — two separate layers of correction

**Layer 1, pre-implementation (before any task started).** The plan itself was verified against the actual codebase before being written, per this project's established practice of checking a phase's own assumptions rather than trusting an audit document's claims at face value. This found H-2 was undercounted (the external audit's four sites vs. ten real ones sharing the identical `role === 'branch_manager'` pattern — six more found by grepping for the same literal) and H-3's fix was narrower than implied (the `firebase-admin`-rooted advisories are genuinely unfixable today, not just unaddressed — npm's own suggested fix is a semver-major downgrade that risks breaking Firestore Enterprise named-database support and Cloud Functions v2 compatibility). Both corrections are documented in the plan's own "Findings verified against the actual codebase before this plan was written" section and were known going into Task 1, not discovered mid-phase.

**Layer 2, during the fix-loop process itself.** Three of five tasks (2, 3, 5) surfaced additional real issues their own review round caught, beyond what pre-verification had already found:

- Task 2's file list, followed exactly, still left two genuine false positives once the new ESLint rule actually ran against the whole repo — `NavShell.tsx`'s `'branch_manager'`-half of its offline-queue-indicator display check, and `canMessage.ts`'s four role-literal comparisons implementing Phase 19's messaging-hierarchy relationship check (a structurally different, deliberately role-identity-based access category, not the H-2 bug class). Neither was in the plan's own file list; both required narrow, justified `eslint-disable` suppressions to avoid regressing `eslint .` to a new failure while still closing the real ten sites.
- Task 3's own brief draft had two typo'd `sanitizeFileName` unit-test literals (inconsistent with its own reference implementation) and an unflagged consequence — the new magic-byte check correctly broke 15 pre-existing tests across three files that faked upload content with arbitrary, non-magic-byte bytes. Both were found and fixed during implementation, not deferred.
- Task 5's actual final `npm audit --omit=dev` count (6 moderate) differs from the plan's own stated expectation (7 moderate) — a strictly positive deviation (an unplanned `npm audit fix` also cleared `protobufjs`), re-confirmed independently at this wrap-up task by re-running the command fresh rather than trusting the earlier number.

## Review findings per task

Tracked in `.superpowers/sdd/2026-08-06-phase-42-security-remediation/progress.md`. **Correction to this wrap-up task's own brief**: it's not the case that every task had an Important finding requiring a fix round — Tasks 1 and 4 reviewed clean on the first pass (minor/deferred notes only, no code changes required); Tasks 2, 3, and 5 each had exactly one Important finding, fixed in a single round. Stated plainly here rather than silently forcing all five into a uniform narrative.

- **Task 1 (H-1):** review clean, no fix round (commits `41503c7..b69ce14`). Minor/deferred notes on record: a written-but-never-read `session:email:` rate-limit counter (a brief-mandated dead transaction — the strict-role rejection increments it but nothing currently reads that specific key back), asymmetric IP-header normalization between the two routes (`x-vercel-forwarded-for` used raw in one, `.split/.trim`'d in the other), the fail-closed (503/`unavailable`) path untested in both routes, the new `no_claims` audit entry untested, and a couple of smaller test/documentation nits — none blocking, none touching the actual fix's correctness.
- **Task 2 (H-2):** one Important finding, fix round 1 (commits `cc728eb..90bebec`) — the new `branchLockedOverrideScoping.test.ts`'s `buildInventoryReport` assertion was vacuously true: no `products/p1` doc was seeded, so `inventory.ts`'s "skip orphaned stock rows" logic emptied `report.rows` entirely, and `[].every(...)` passed regardless of whether the branch filter actually worked. Fixed by seeding the missing product doc and adding an explicit `rows.length` assertion; the fix was sanity-checked by temporarily reverting `inventory.ts`'s guard back to the literal check and confirming the test then genuinely failed for the right reason, then reverting that scratch change with a confirmed zero-diff. Minor/deferred notes: the `canMessage.ts` suppression is file-level (broader than the four offending lines, low residual risk), a stale comment in `lowStockSummary.ts`, and the new ESLint rule's known blind spot (`.includes()`/`switch`/object-key-lookup role comparisons aren't matched, no current instance).
- **Task 3 (M-1):** one Important finding, fix round 1 (commits `2131a48..9242e1b`) — the new integration test's `roleCapabilityOverrides/branch_manager` doc (written in `beforeAll` to grant a branch-locked role a view capability it lacks by default, purely to construct a genuinely branch-locked, view-capable test viewer) was never cleaned up — a real test-ordering hazard given overrides are complete-replacement (Phase 39 semantics), since any later test authenticating a `branch_manager` before the next full reset would inherit the pinned, narrower capability set. Fixed with an `afterAll` cleanup matching the established pattern in `roleOverrideResolution.test.ts`. Minor/deferred notes: `sanitizeFileName`'s `encodeURIComponent` call can throw `URIError` on a truncated unpaired surrogate (attacker-controlled filename, own attachment only), no end-to-end integration test that the upload route rejects a spoofed file (unit coverage on `sniffMimeType` only), `sanitizeFileName` can return an empty string in a pathological case, and the PDF magic-byte check requires `%PDF-` at byte 0 exactly (some real-world scanner/mobile pipelines emit a leading BOM/whitespace) — flagged as a real-world watch item for live verification, not fixed.
- **Task 4 (M-2):** review clean, no fix round (commits `9242e1b..2e28611`). Minor/deferred notes: no `report-to`/`report-uri` directive on the CSP (this is the concrete gap TD-9's own precondition names — violations are visible only in each viewer's own devtools console today, no collected data source yet for the review that has to precede the enforcing switch), an `X-Frame-Options` code comment that reads as though CSP's `frame-ancestors` is the primary clickjacking control when in fact `X-Frame-Options` is the only *enforcing* one today (becomes accurate once CSP goes enforcing), and `Permissions-Policy`'s `camera=()` denial being correct today (uploads use the OS file picker) but a constraint worth remembering if a future in-browser `getUserMedia` receipt-capture feature is ever built.
- **Task 5 (H-3):** one Important finding, fix round 1 (commits `523f080..04baa80`) — `npm audit fix --omit=dev` pruning devDependencies, followed by the restorative plain `npm install` (run to get `tsc`/`npm test` working again), silently re-resolved `package-lock.json`'s `firebase-admin` entry from `14.1.0` to the newly-published `14.2.0` (dropping the `farmhash-modern` sub-dependency in the process) — even though `package.json`'s declared `^14.1.0` range was never edited. Not dangerous in itself (identical audit result, clean tests/build under 14.2.0), but exactly the kind of incidental drift on this app's single most load-bearing dependency that has burned this project before (Phase 35's `jose`/`jwks-rsa` incompatibility), and a diff in a security-remediation phase specifically claiming `firebase-admin` was untouched needs to actually be that. Fixed via `npm install firebase-admin@14.1.0`, re-verified with an identical audit result (6 moderate, same six advisory names) and a surgical two-line lockfile diff (`firebase-admin` version/resolved/integrity, `farmhash-modern` restored — nothing else). Minor/deferred notes: `next`/`eslint-config-next`'s pin convention loosened from exact to caret range as a side effect of `npm install`'s default behavior, and the `middleware`→`proxy` deprecation warning (now TD-11).

## Step 1 — automated verification (re-run fresh at this wrap-up task, not just trusted from task reports)

```
$ npx tsc --noEmit
(clean, no output, exit 0)
```

```
$ npx eslint .
✖ 38 problems (34 errors, 4 warnings)
  0 errors and 1 warning potentially fixable with the --fix option
```
`grep -c "no-restricted-syntax"` on the full output: **0** — the H-2 ESLint rule fires zero violations across the real codebase. All 34 errors and 4 warnings are pre-existing, unrelated debt: the `react-hooks/set-state-in-effect` cluster (`CheckoutForm.tsx`, `CategoryBarChart.tsx`, `RankedBarChart.tsx`, `useOnlineStatus.ts`), a handful of `@typescript-eslint/no-unused-vars` warnings, and one `no-control-regex` unused-`eslint-disable` warning in `src/lib/attachments/sanitizeFileName.ts` (a 1-warning increase over Task 2's own final count of 37, attributable to Task 3's later-added file, not a regression from this wrap-up task). None of this is introduced by Phase 42's actual fixes and none of it is new since Task 5's own last clean run.

```
$ export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin:$PATH" && npm test
 Test Files  29 passed (29)
      Tests  574 passed (574)
   Duration  32.62s
+ Script exited successfully (code 0)
```

```
$ npm audit --omit=dev

uuid  <11.1.1
Severity: moderate
fix available via `npm audit fix --force`
Will install firebase-admin@10.3.0, which is a breaking change
node_modules/uuid
  gaxios  6.4.0 - 6.7.1
  teeny-request  3.9.1 - 9.0.0
    @google-cloud/storage  2.2.0 - 2.5.0 || >=5.19.0
      firebase-admin  7.0.0 - 8.2.0 || >=11.0.0
    retry-request  7.0.0 - 7.0.2

6 moderate severity vulnerabilities
```

**0 high (down from 5), 6 moderate (down from 7)** — all six moderate advisories rooted in `firebase-admin`'s own `@google-cloud/storage`/`gaxios`/`teeny-request`/`retry-request`/`uuid` dependency chain, exactly as Task 5 left it and documented as accepted (TD-10). **Note on this wrap-up task's own brief**: Step 1's acceptance bar stated "0 high, 7 moderate... down from 5 high / 7 moderate" — the correct current number is 6 moderate, not 7, since a plain (non-`--force`) `npm audit fix` incidentally also cleared `protobufjs` during Task 5 (documented in that task's own report as an unplanned bonus). Confirmed here by running the command fresh rather than repeating the brief's stated expectation.

`firebase-admin` confirmed genuinely untouched at both layers: `package.json` still declares `^14.1.0`, and `package-lock.json`'s resolved entry is `14.1.0` (both re-checked directly at this wrap-up task, not assumed from Task 5's report).

## Step 2 — live verification: NOT DONE, pending

Per this task's explicit scope, live verification against real `erp-lfd` data — provisioning temporary test accounts, confirming each of the five findings end-to-end through the actual browser/HTTP surface, and checking response headers on the real Vercel deployment — was **not attempted**. This project has a standing rule that writing test data to live production Firestore requires the user's explicit go-ahead each time it's proposed, which is a live conversation between the controller and the user, not something available to a wrap-up task running independently. **This remains outstanding and must be performed separately, by the controller, with the user's direct involvement, before Phase 42 can be considered fully closed.** The five specific checks the plan's own Step 2 names, still needed:

1. H-1: sign in as a temporary `super_admin` test account via the client SDK, POST the resulting ID token to `/api/auth/session`, confirm 403 and the `login_failed` audit entry with `details.reason: 'strict_role_wrong_path'`.
2. H-2: grant `reports.sales.view` to `cashier` via the live Role Capability Editor, confirm the Sales report and Dashboard revenue-trend widget both stay branch-scoped, then reset. Separately, grant `hr.attendance.view` to `cashier` and confirm `/attendance` (both modes) stays branch-scoped — `attendance/page.tsx` has no automated regression coverage, so this manual check is its *only* verification.
3. M-1: as a temporary branch-locked test account, attempt to fetch a different branch's attachment by ID directly, confirm 404.
4. M-2: check response headers on the actual Vercel deployment (not just local `curl`), confirming the CSP report-only header, HSTS, and the rest all survive Vercel's own edge.
5. H-3: confirm `npm audit --omit=dev` on the deployed environment's lockfile matches the 0 high / 6 moderate result above.

## Step 6 — tag: NOT DONE, pending

`phase-42-baseline` was not created. Per this task's explicit scope and the plan's own Step 6 instruction, tagging happens after live verification confirms everything works and is the controller's responsibility, not this wrap-up task's — and pushing the tag needs its own explicit confirmation regardless, same as every prior phase.

## Files changed by this wrap-up task

- `CLAUDE.md` — added a full Phase 42 section (H-1/H-2/H-3/M-1/M-2), updated the "Current status" line to name Phase 42 as the latest shipped phase, and flagged — rather than silently backfilled — that Phases 40 through 41 were never entered into this file's prose despite shipping and being independently audited; extended the file's own Process note with this as a sixth/seventh drift instance.
- `docs/tech-debt.md` — added TD-9 (CSP enforcing-mode switch, needs a real deployment window's report-only violation data reviewed first), TD-10 (`firebase-admin`'s six moderate advisories, accepted with an exact trigger condition for revisiting), TD-11 (`middleware`→`proxy` Next.js deprecation warning, not urgent, given a home so it isn't lost).
- `docs/superpowers/plans/2026-08-07-phase-42-security-remediation-completion.md` — this report.

## A note on CLAUDE.md's own currency, found while doing this task

Reading CLAUDE.md before drafting the Phase 42 addition surfaced that its "Current status" line and phase-by-phase narrative had not actually been kept current since Phase 39 — Phases 40 through 40.6 (the design-primitive rollout that resolved TD-6) and Phase 41 (TD-8's Button accessibility fix) both shipped, were independently audited, and are fully reflected in `docs/tech-debt.md`, but no phase ever wrote their content into CLAUDE.md's own prose narrative. This is flagged directly in CLAUDE.md itself (both the Current-status line and the Process note now name it) rather than silently patched here: reconstructing six phases of dense, specific narrative from a wrap-up task scoped to a different phase risks getting their content wrong from the outside, which would be worse than an honest, visible gap. A future phase should do that backfill deliberately, reading each phase's own completion report directly — not treat it as already covered because `docs/tech-debt.md` reflects the outcome.

## Next steps

1. **Live verification (Step 2)** — controller-led, with the user's explicit go-ahead for any live-Firestore test writes, against the five checks listed above.
2. **Tag (Step 6)** — `phase-42-baseline`, created only after live verification confirms everything works; push only on explicit request, per this project's standing tag-on-request-only convention.
3. TD-9's enforcing-CSP switch, once a real deployment window's report-only violation data exists to review (and a `report-to`/`report-uri` collector exists to gather it — currently absent, per Task 4's own minor/deferred note).
4. TD-10 revisited only if `npm view firebase-admin versions` shows a release whose dependency tree has moved off the vulnerable `@google-cloud/storage`/`gaxios`/`uuid`/`teeny-request`/`retry-request`/`protobufjs` chain.
5. TD-11 (`middleware`→`proxy` migration) whenever a phase is willing to touch the auth-adjacent `middleware.ts` with the same review rigor this project applies to any other auth-path change.
6. The CLAUDE.md Phases 40–41 backfill named above, as its own deliberate task.
