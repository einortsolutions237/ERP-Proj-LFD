# Phase 27 — HR & Audit Log Design Rollout + Accounting/Payroll Consistency Check

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the established structural design conventions (rounded-2xl cards, `--shadow-card`, tinted table headers, the tint/badge idiom for status, monospace-only where numeric, proper empty states) to My Leave, Review Leave, Attendance, and Audit Log — the four screens named in `CLAUDE.md`'s "Still unstyled" list that this phase can reach (clinical/messaging/roles are explicitly out of scope). Presentation only: zero behavior change anywhere.

**Pre-implementation research finding (Accounting/Payroll consistency check — done, not deferred):** `/expenses`, `/expenses/new`, `/payroll`, `/payroll/new`, and `/reports/pnl` were read directly from disk and grepped for every old-style class this project's design rollouts have historically found (`bg-black`, `text-gray-*`, `border-collapse`, bare `border rounded`). **Zero matches anywhere.** All five screens already use `rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]` card/table wrappers, `bg-mist/40` tinted headers, `divide-y divide-mist` rows with hover states, `font-mono text-right` money cells, `font-display text-2xl font-semibold text-ink` headings, and `bg-marine`/`focus:border-marine` form controls — the exact Phase 25 (Sales Report/Stock Report/Settings) convention, byte-for-byte in several spots. **Conclusion: no Accounting/Payroll changes are needed this phase.** (The Phase 24 icon-badge/tinted-card treatment is a `DashboardCard`-specific convention for dashboard widgets, not something list/report pages like Sales Report or Settings ever received either — Accounting/Payroll correctly matches its actual peer set.)

**Architecture:** Four screens, three genuinely separate concerns (My Leave + Review Leave share the leave-request domain and its two supporting client components; Attendance is a single self-contained page; Audit Log is a page + one table component). No new components introduced — every screen reuses patterns already established elsewhere in this codebase (the `StaffTable.tsx` active/inactive pill for the badge idiom, the `expenses`/`payroll` list pages for table/card structure, `ExpenseForm.tsx`/`PayrollForm.tsx` for form-control structure, `AppointmentsTable.tsx`'s bordered-danger button for a reject/cancel action).

## Global Constraints

- Presentation only. Do not touch: `requireCapability` calls, Firestore query logic (including the `branch_manager` vs. org-wide branching in `leave/review/page.tsx` and `attendance/page.tsx`), the self-approval prevention check (lives in `api/leave-requests/[id]/route.ts`, not touched by this plan at all), `LeaveReviewButtons.tsx`'s/`LeaveRequestForm.tsx`'s `fetch()` calls and payload shapes, attendance check-in/out logic (lives in `AttendanceWidget.tsx` on the dashboard, already Phase 23/24-styled, not touched — the `/attendance` page itself has no check-in/out actions, it's a roster/history view only), or `AuditLogTable.tsx`'s data shape/JSON rendering of `details`.
- No new capabilities, no new Firestore rules, no new collections, no new routes.
- No color or font token changes — every class used must already exist in `globals.css`'s established palette (`marine`/`brass`/`mist`/`slate`/`ink`/`paper`/`surface`/`success`/`danger`/`warning`/`info`).
- Colors/fonts are already correct everywhere via the global token cascade (confirmed in research — no component in scope has a hardcoded hex or non-Inter font reference); this phase is structural-only, matching every prior design-rollout phase's actual scope.

## File Structure

- `src/app/(dashboard)/leave/page.tsx` (modify) — My Leave.
- `src/components/leave/LeaveRequestForm.tsx` (modify).
- `src/app/(dashboard)/leave/review/page.tsx` (modify) — Review Leave.
- `src/components/leave/LeaveReviewButtons.tsx` (modify).
- `src/app/(dashboard)/attendance/page.tsx` (modify).
- `src/app/(dashboard)/audit-log/page.tsx` (modify).
- `src/components/audit/AuditLogTable.tsx` (modify).

No test files — this project has no component-rendering test framework (per Phase 24/25's own precedent, presentation-only phases add no application-code tests). `tsc --noEmit` is the verification gate for every task.

---

### Task 1: My Leave + Review Leave

**Files:**
- Modify: `src/app/(dashboard)/leave/page.tsx`
- Modify: `src/components/leave/LeaveRequestForm.tsx`
- Modify: `src/app/(dashboard)/leave/review/page.tsx`
- Modify: `src/components/leave/LeaveReviewButtons.tsx`

**Interfaces:** none change — `LeaveType`/`LeaveStatus` (`src/lib/types/leave-request.ts`) are read-only inputs to the badge/select rendering, not modified.

- [ ] **Step 1: Restyle `src/app/(dashboard)/leave/page.tsx`**

Replace the file's return statement and the row-status rendering. Full file:

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import LeaveRequestForm from '@/components/leave/LeaveRequestForm'
import type { LeaveRequest } from '@/lib/types/leave-request'

// Rows are built field-by-field from the raw doc (never spread) so a
// Firestore Timestamp can never leak into this page's render — same
// discipline as customers/[id]/page.tsx's PurchaseRow.
interface MyLeaveRow {
  id: string
  type: string
  startDate: string
  endDate: string
  reason: string | null
  status: string
  reviewNote: string | null
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-danger/10 text-danger',
}

export default async function MyLeavePage() {
  let user
  try {
    user = await requireCapability('hr.leave.request')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore()
    .collection('leaveRequests')
    .where('staffId', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .get()

  const requests: MyLeaveRow[] = snap.docs.map((d) => {
    const data = d.data() as LeaveRequest
    return {
      id: d.id,
      type: data.type,
      startDate: data.startDate.toDate().toISOString().slice(0, 10),
      endDate: data.endDate.toDate().toISOString().slice(0, 10),
      reason: data.reason,
      status: data.status,
      reviewNote: data.reviewNote,
    }
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">My Leave</h1>

      <LeaveRequestForm />

      <div className="space-y-3">
        <h2 className="text-lg font-medium text-ink">My requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-slate">No leave requests yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Start</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">End</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reason</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Review note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {requests.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                    <td className="px-3 py-2 text-ink">{row.type}</td>
                    <td className="px-3 py-2 text-ink">{row.startDate}</td>
                    <td className="px-3 py-2 text-ink">{row.endDate}</td>
                    <td className="px-3 py-2 text-ink">{row.reason ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate/10 text-slate'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink">{row.reviewNote ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Restyle `src/components/leave/LeaveRequestForm.tsx`**

Replace only the JSX return (all state/logic/`handleSubmit` untouched):

```tsx
  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LeaveType)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          {LEAVE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Start date</label>
        <input
          required
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">End date</label>
        <input
          required
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Reason</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        Submit request
      </button>
    </form>
  )
```

- [ ] **Step 3: Restyle `src/app/(dashboard)/leave/review/page.tsx`**

Full file (adds the same status-badge import pattern is not needed here — this page has no status column; only the table/heading treatment changes):

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import LeaveReviewButtons from '@/components/leave/LeaveReviewButtons'
import type { LeaveRequest } from '@/lib/types/leave-request'

// Rows are built field-by-field from the raw doc (never spread) so a
// Firestore Timestamp can never leak into this page's render — same
// discipline as customers/[id]/page.tsx's PurchaseRow.
interface ReviewRow {
  id: string
  staffName: string
  type: string
  startDate: string
  endDate: string
  reason: string | null
}

export default async function ReviewLeavePage() {
  let user
  try {
    user = await requireCapability('hr.leave.approve')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()

  let query: FirebaseFirestore.Query =
    user.role === 'branch_manager'
      ? db.collection('leaveRequests').where('branchId', '==', user.branchId).where('status', '==', 'pending')
      : db.collection('leaveRequests').where('status', '==', 'pending')
  const snap = await query.orderBy('createdAt', 'desc').get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as LeaveRequest }))

  const uniqueStaffIds = Array.from(new Set(docs.map((d) => d.data.staffId)))
  const staffDocs = await Promise.all(uniqueStaffIds.map((id) => db.collection('staff').doc(id).get()))
  const staffNames: Record<string, string> = {}
  uniqueStaffIds.forEach((id, i) => {
    staffNames[id] = staffDocs[i].data()?.name ?? id
  })

  const requests: ReviewRow[] = docs.map(({ id, data }) => ({
    id,
    staffName: staffNames[data.staffId] ?? data.staffId,
    type: data.type,
    startDate: data.startDate.toDate().toISOString().slice(0, 10),
    endDate: data.endDate.toDate().toISOString().slice(0, 10),
    reason: data.reason,
  }))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Review Leave</h1>

      {requests.length === 0 ? (
        <p className="text-sm text-slate">No pending leave requests.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Staff</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Start</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">End</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reason</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {requests.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{row.staffName}</td>
                  <td className="px-3 py-2 text-ink">{row.type}</td>
                  <td className="px-3 py-2 text-ink">{row.startDate}</td>
                  <td className="px-3 py-2 text-ink">{row.endDate}</td>
                  <td className="px-3 py-2 text-ink">{row.reason ?? '—'}</td>
                  <td className="px-3 py-2">
                    <LeaveReviewButtons requestId={row.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Restyle `src/components/leave/LeaveReviewButtons.tsx`**

Replace only the two JSX return blocks (all state/logic/`handleConfirm`/`handleCancel` untouched):

```tsx
  if (pendingAction === null) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPendingAction('approve')}
          className="rounded-lg bg-marine px-3 py-2 text-xs text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setPendingAction('reject')}
          className="rounded-md border border-danger px-3 py-2 text-xs text-danger transition-colors hover:bg-danger/10"
        >
          Reject
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm space-y-3">
      <div>
        <label className="block text-sm font-medium text-ink">Review note</label>
        <textarea
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          rows={3}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className={
            pendingAction === 'approve'
              ? 'rounded-lg bg-marine px-3 py-2 text-xs text-paper transition-opacity duration-200 disabled:opacity-50'
              : 'rounded-md border border-danger px-3 py-2 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50'
          }
        >
          {pendingAction === 'approve' ? 'Confirm approve' : 'Confirm reject'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="rounded-md border border-mist px-3 py-2 text-xs text-ink transition-colors hover:bg-mist/40 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
```

(Note: `handleCancel` here is the "cancel the approve/reject action panel" handler already in the file, unrelated to leave-request cancellation, which this app doesn't have — don't confuse with `AppointmentsTable`'s unrelated "Confirm cancel" appointment action.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/leave src/components/leave
git commit -m "style: structural design rollout for My Leave and Review Leave"
```

---

### Task 2: Attendance

**Files:**
- Modify: `src/app/(dashboard)/attendance/page.tsx`

**Interfaces:** none change.

- [ ] **Step 1: Restyle the full file**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getTodayDateString } from '@/lib/attendance/today'
import type { AttendanceRecord } from '@/lib/types/attendance'

// Rows are built field-by-field from the raw doc (never spread) so a
// Firestore Timestamp can never leak into this page's render — same
// discipline as leave/review/page.tsx's ReviewRow and
// customers/[id]/page.tsx's PurchaseRow.
interface AttendanceRow {
  id: string
  staffName: string
  date: string
  status: string
  checkInAt: string
  checkOutAt: string | null
}

const STATUS_BADGE: Record<string, string> = {
  checked_in: 'bg-success/10 text-success',
  checked_out: 'bg-slate/10 text-slate',
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; history?: string }>
}) {
  const { date: dateParam, history } = await searchParams

  let user
  try {
    user = await requireCapability('hr.attendance.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const isHistory = Boolean(history)
  const date = dateParam ?? getTodayDateString()

  let query: FirebaseFirestore.Query
  if (isHistory) {
    // Full history, all dates — mirrors H5's history mode.
    query =
      user.role === 'branch_manager'
        ? db.collection('attendanceRecords').where('branchId', '==', user.branchId).orderBy('date', 'desc')
        : db.collection('attendanceRecords').orderBy('date', 'desc')
  } else {
    // Day roster: pure equality query, no .orderBy() — mirrors H5's default
    // mode, avoids needing a composite index.
    query =
      user.role === 'branch_manager'
        ? db.collection('attendanceRecords').where('branchId', '==', user.branchId).where('date', '==', date)
        : db.collection('attendanceRecords').where('date', '==', date)
  }

  const snap = await query.get()
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as AttendanceRecord }))

  const uniqueStaffIds = Array.from(new Set(docs.map((d) => d.data.staffId)))
  const staffDocs = await Promise.all(uniqueStaffIds.map((id) => db.collection('staff').doc(id).get()))
  const staffNames: Record<string, string> = {}
  uniqueStaffIds.forEach((id, i) => {
    staffNames[id] = staffDocs[i].data()?.name ?? id
  })

  const rows: AttendanceRow[] = docs.map(({ id, data }) => ({
    id,
    staffName: staffNames[data.staffId] ?? data.staffId,
    date: data.date,
    status: data.status,
    checkInAt: data.checkInAt.toDate().toLocaleTimeString(),
    checkOutAt: data.checkOutAt ? data.checkOutAt.toDate().toLocaleTimeString() : null,
  }))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Attendance</h1>
        {isHistory ? (
          <Link href="/attendance" className="text-sm text-marine hover:underline">
            Back to today&apos;s roster
          </Link>
        ) : (
          <Link href="/attendance?history=true" className="text-sm text-marine hover:underline">
            View history
          </Link>
        )}
      </div>

      {!isHistory && (
        <form method="GET" className="flex items-end gap-2">
          <div>
            <label className="block text-sm font-medium text-ink">Date</label>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
            />
          </div>
          <button type="submit" className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-opacity duration-200 disabled:opacity-50">
            View day
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate">
          {isHistory ? 'No attendance history.' : 'No attendance records for this day.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Staff</th>
                {isHistory && <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>}
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Check In</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Check Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{row.staffName}</td>
                  {isHistory && <td className="px-3 py-2 text-ink">{row.date}</td>}
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate/10 text-slate'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-ink">{row.checkInAt}</td>
                  <td className="px-3 py-2 font-mono text-ink">{row.checkOutAt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/attendance
git commit -m "style: structural design rollout for Attendance"
```

---

### Task 3: Audit Log

**Files:**
- Modify: `src/app/(dashboard)/audit-log/page.tsx`
- Modify: `src/components/audit/AuditLogTable.tsx`

**Interfaces:** none change — `AuditLogRow` shape untouched, `details` still rendered via `JSON.stringify` (behavior-preserving; this is a read-only diagnostic view, not a place to add new formatting logic).

- [ ] **Step 1: Restyle `src/app/(dashboard)/audit-log/page.tsx`**

Change only the `<h1>` and outer wrapper (data-fetching untouched):

```tsx
import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import AuditLogTable, { type AuditLogRow } from '@/components/audit/AuditLogTable'

export default async function AuditLogPage() {
  try {
    await requireCapability('admin.auditLog.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore().collection('auditLogs').orderBy('createdAt', 'desc').limit(200).get()
  const logs: AuditLogRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
    } as AuditLogRow
  })

  return (
    <div className="max-w-6xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Audit Log</h1>
      </div>
      <AuditLogTable logs={logs} />
    </div>
  )
}
```

- [ ] **Step 2: Restyle `src/components/audit/AuditLogTable.tsx`**

Full file — add an empty state (the only screen in this phase's scope that never had one) and the established table treatment:

```tsx
'use client'
import type { AuditLogEntry } from '@/lib/types/audit'

// Server Components can't pass Firestore Timestamp instances to Client
// Components (Next.js only serializes plain objects across that boundary),
// so the list page converts createdAt to ISO string before handing
// rows to this table.
export type AuditLogRow = Omit<AuditLogEntry, 'createdAt'> & {
  createdAt: string
}

export default function AuditLogTable({ logs }: { logs: AuditLogRow[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-slate">No audit log entries yet.</p>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-mist/40">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Timestamp</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Action</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Actor Email</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Target UID</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {logs.map((row) => (
            <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
              <td className="px-3 py-2 text-ink">{new Date(row.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2 text-ink">{row.action}</td>
              <td className="px-3 py-2 text-ink">{row.actorEmail ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink">{row.targetUid ?? '—'}</td>
              <td className="px-3 py-2 text-ink">{row.branchId ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink">
                {row.details ? JSON.stringify(row.details) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/audit-log src/components/audit
git commit -m "style: structural design rollout for Audit Log, add missing empty state"
```

---

### Task 4: Full-suite verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all 470 tests still pass, zero regressions — this phase adds no application-code tests (presentation-only, same as Phases 24/25).

- [ ] **Step 2: Confirm behavior-preservation, by reading, not re-testing**

Read the final diff for all 7 files and confirm: no `requireCapability` call was touched, no Firestore query (`.where`/`.orderBy`) was touched, `LeaveReviewButtons.tsx`'s `handleConfirm`/`fetch` body was byte-identical before/after (only the two `return (...)` JSX blocks changed), `LeaveRequestForm.tsx`'s `handleSubmit` was byte-identical, `AuditLogTable.tsx`'s `details` rendering is still `JSON.stringify(row.details)` verbatim. This is the "presentation only" claim checked directly, not asserted.

- [ ] **Step 3: Live verification (attempt — this has failed to connect for 5 consecutive phases, worth retrying rather than assuming failure)**

Try the Claude-in-Chrome browser tools fresh. If reachable: sign in as `hr_admin`/`branch_manager`/a plain staff account, visit My Leave (submit a real leave request, confirm the pending badge renders amber), Review Leave (approve/reject it, confirm the self-approval prevention still blocks the same actor if applicable), Attendance (view today's roster and history), Audit Log (confirm the new entries appear, confirm the empty state if a filtered view has none). If unreachable after one retry: say so plainly in the completion report, do not present the code-level behavior-preservation check in Step 2 as equivalent to a visual check.

---

## After all tasks: CLAUDE.md and completion report

Once Task 4 passes, write `docs/superpowers/plans/2026-07-19-phase-27-hr-auditlog-design-rollout-completion.md` and update `CLAUDE.md`'s "Current status"/design-system coverage note to reflect Phase 27 as shipped, including the Accounting/Payroll consistency-check finding (already compliant, no changes made) as part of the record — using only what this plan and its verification actually confirmed. Tag `phase-27-baseline` only if the user explicitly requests it.
