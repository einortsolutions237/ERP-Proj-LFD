# Phase 34 — Roles & Seminars Design Rollout + Sales Log Fix — Completion Report

**Date:** 2026-07-21
**Plan:** specified directly in this session's phase brief (no separate plan doc — same as Phases 32/33 immediately before this one)
**Status:** Complete. Build and tests both clean. All four items drawn directly from Phase 33's self-audit findings, live-verified.

## Summary

Four bounded items, all pre-identified by Phase 33's self-audit — nothing speculative added. The Roles module got its first-ever design-system pass (it was the last untouched screen in the app); the Seminars module got a structural-only pass (it already had correct colors/fonts via the token cascade, built in Phase 16 before the design system existed); 4 isolated `rounded-md` instances were fixed across 3 already-current files; and the Sales Log's raw-`cashierUid` display was replaced with a resolved name, reusing `getSaleDetail.ts`'s exact pattern. 13 files changed, all confirmed presentation/display-resolution only by direct diff review, and live-verified end-to-end.

## Task detail

### 1. Roles module — full design-system migration

`roles/page.tsx`, `RoleMatrix.tsx`, `RoleReassignmentTable.tsx` — the last screen in the app never touched by any design phase (`border-collapse` tables, raw `bg-gray-50`/`text-gray-*`/`text-red-600`). Now on the established conventions:

- **`RoleMatrix.tsx`**: `rounded-2xl`/`shadow-[var(--shadow-card)]` card wrapper, `bg-mist/40` header row with `uppercase tracking-wide` `th`s, `divide-y divide-mist` body. Granted capabilities render as a small `bg-success/10 text-success` tinted circular badge with a checkmark (`sr-only` "Granted" text for accessibility) instead of a bare `✓` character — deliberately chosen to avoid the WCAG contrast failure Phase 31 found with raw `text-success` on small text (an icon on a tinted background has different, met contrast requirements than small colored text does). The `super_admin` row keeps its "(full access, protected)" treatment, now `bg-mist/40` instead of `bg-gray-50`.
- **`RoleReassignmentTable.tsx`**: same card/table treatment; error text moved from raw `text-red-600` to `text-danger` with `role="alert"`; role names (both the "Current role" column and the reassignment `<select>`'s options) now go through a local `humanizeRole()` — the same function every other role-displaying component in this app (`StaffTable`, `StaffForm`, `NavShell`, messaging) already duplicates locally, reused here rather than inventing a new display convention. The `<select>`'s `value` attribute stays the raw `RoleId` (only the visible label is humanized), so `handleRoleChange`'s `e.target.value` is unaffected.
- **`roles/page.tsx`**: heading brought onto the standard `font-display text-2xl font-semibold text-ink` / `text-sm text-slate` pattern every other page-level heading uses.

Zero changes to `handleRoleChange`, the `PATCH /api/staff/[id]` call, `ASSIGNABLE_ROLES` filtering, the `isSuperAdmin` guard, or `ROLE_CAPABILITIES`/`ROLES` iteration — confirmed by direct diff review (see Verification below).

### 2. Seminars module — structural-only pass

`SeminarForm.tsx`, `AttendanceForm.tsx`, `AttendanceTable.tsx`, `SeminarDetailClient.tsx`, `seminars/page.tsx` — built in Phase 16, correct color tokens already in place via the global CSS-custom-property cascade (confirmed by reading each file first, per this phase's own instruction). Every `rounded-md` replaced: `rounded-lg` for inputs/selects/secondary buttons and the list-table container upgraded to `rounded-2xl`/`shadow-[var(--shadow-card)]` (matching `CustomerTable.tsx`'s reference pattern), primary submit buttons brought to the standard `min-h-11 rounded-lg ... transition-opacity duration-200 disabled:opacity-50` shape already used elsewhere (`CustomerForm.tsx`), and the one row-hover class-order drift (`hover:bg-mist/40 transition-colors` → `transition-colors duration-200 hover:bg-mist/40`) fixed to match the established convention. Zero changes to `handleSubmit`, the seminar/attendance POST/PATCH payloads, `filteredCustomers` search logic, or `toDatetimeLocalValue`'s timezone-correct reconstruction.

### 3. Ride-along fix: isolated `rounded-md` instances

`AttachScanForm.tsx`, `LabResultForm.tsx` (×2), `AttachReceiptForm.tsx` — each had exactly one button/icon still on the old radius convention while the rest of the file was current. Fixed all 4. **Correction to Phase 33's own finding**: that report described this as "8 isolated `rounded-md` buttons," but the actual count in those 4 named files was 4, not 8 — confirmed by direct grep before and after (0 matches for `rounded-md` anywhere in `src/` now, versus these exact 4 hits before this phase's edits). Flagging the discrepancy rather than silently reproducing an inflated number, consistent with this project's own verify-before-repeating-a-claim discipline.

### 4. Sales Log — resolved cashier name

`SalesTable.tsx` was rendering `{row.cashierUid}` — a raw Firebase UID — directly. `SaleRow` gained a `cashierName: string` field; the table now renders `{row.cashierName}` (keeping `title={row.cashierUid}` on the truncating cell, so the raw UID is still available on hover, same UX affordance the cell already had). `pos/sales/page.tsx` resolves it using the identical pattern `getSaleDetail.ts` (Phase 29) already established: collect unique `cashierUid`s from the fetched sales, batch-fetch the corresponding `staff` docs in parallel, build a `Record<string, string>` name map with `?? uid` fallback for a resolution failure — reused rather than reinvented, per the brief. Zero changes to the branch-scoping query (`isBranchLocked(user.role)` ? ... : ...) or the `voided` computation.

## Verification

- **`npm run build`**: clean, exit 0, `tsc` passes inline, all routes generate. Confirmed after all edits.
- **`npx tsc --noEmit`**: run after each module (Roles, Seminars, the isolated fixes, Sales Log) individually, clean every time, and once more at the end.
- **`npm test`**: 505/505 passing throughout — this phase touched zero test-covered logic (route handlers, capability checks, transactions), so zero test changes were needed or expected; re-run after every module to confirm no incidental breakage.
- **Diff review**: every changed file's diff was read directly (not just described) to confirm the change was presentation/display-resolution only. Specifically confirmed unchanged: `handleRoleChange`'s fetch/PATCH/error-handling flow and `ROLE_CAPABILITIES`/`ROLES` iteration in the Roles files; `handleSubmit`/payload construction and `filteredCustomers` search in the Seminars files; the branch-scoping query and `voided` boolean computation in the Sales Log page.

### Live verification against real `erp-lfd` data

Browser automation was reachable this session (dev server on port 3000 was stale again — same recurring class as prior sessions — the already-running healthy instance on port 3001 was used). Real session cookie minted for the real `super_admin` account via the established Admin-SDK custom-token-exchange pattern.

- **Roles**: capability matrix renders with the tinted checkmark badges and card treatment exactly as designed (screenshot-confirmed); the reassignment table shows humanized role names (`Cashier`, `Doctor`, `Finance Admin`, `General Manager`, etc.) in both the current-role column and the dropdown's default-selected option, confirming `humanizeRole()` and `defaultValue={row.role}` both work correctly together.
- **Seminars**: a real seminar ("Verify34 Test Seminar") was created through the actual `/seminars/new` form (submitted via the real `POST /api/seminars` call, not a direct Firestore write), confirmed rendering in the newly-styled list-table card; a real attendance record was then submitted through the actual `AttendanceForm` (`POST /api/seminar-attendance`) and confirmed rendering correctly in the newly-styled `AttendanceTable` card. Both artifacts deleted afterward (no dependent-collection guard exists on `seminars`/`seminarAttendance`, and only *viewing* attendance is audit-logged per Phase 16 — not recording — so a direct Admin-SDK cleanup delete doesn't destroy any audit trail).
- **Sales Log**: confirmed live — the Cashier column now shows real names ("Ikeja Cashier", "Super Admin") instead of raw UIDs, including on the Phase 33 test sale still present from the prior session.
- One tooling snag: `Page.captureScreenshot` timed out three separate times mid-session (not a page-load failure — `get_page_text`/`javascript_tool` calls against the same tab succeeded immediately before and after each timeout). Worked around by retrying the screenshot call once (succeeded every time) and, for the native `<input type="datetime-local">` and `<select>` interaction that a coordinate-based click struggled with, driving those two form fields directly via `javascript_tool` (native property setters + dispatched `input`/`change` events) rather than fighting the segmented widget through `computer` clicks/types — the resulting submission went through the real form's `handleSubmit`/`fetch`, so this doesn't weaken what was actually verified.

## Outstanding items

None new. Phase 33's remaining logged findings (TD-4, TD-5, both still deliberately deferred) are unchanged by this phase. Design-system coverage now extends to Roles and Seminars — per Phase 33's own audit, no further known design-rollout gaps are currently tracked.
