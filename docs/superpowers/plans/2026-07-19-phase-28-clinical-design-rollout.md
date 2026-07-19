# Phase 28 — Clinical Module Design Rollout (Customer-Page Sections) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the established structural design conventions to the clinical-adjacent sections of the customer detail page — treatments, appointments, lab, seminars, pending deliveries — the first slice of this project's largest remaining unstyled tranche. Presentation only: every one of this file's many independent capability gates, and every piece of clinical/delivery data logic, stays exactly as it is.

**Pre-implementation research finding, changing the plan's actual file scope:** the two files named in the brief (`ClinicalSection.tsx`, `PendingDeliveriesSection.tsx`) don't cover the five sections on their own. Reading `customers/[id]/page.tsx` in full found: "Upcoming appointments" is rendered **inline in `page.tsx` itself**, not inside any component (CLAUDE.md's Phase 22 note already flagged this: "the clinical-wall-gated 'Upcoming appointments' section... correctly left on the old convention since appointments aren't one of the eight [Phase 22] entities"). Lab renders via a **separate `LabSection.tsx`**, not inside `ClinicalSection.tsx`. And three of the five sections have their own toggle-open sub-form components (`TreatmentForm.tsx`, `LabOrderForm.tsx`, `LabResultForm.tsx`) that are only reachable *from* the section they belong to — restyling a section's table/cards while leaving its own popup form on the old convention would be a visibly broken, half-finished result on the same screen. **This plan's real file scope is 7 files**, all serving the 5 named sections. See Decision 1.

**A sixth section on this same page is explicitly out of scope, flagged, not touched:** `IntakeSection.tsx` (Patient demographics + Nursing visits, `clinical.intake.view`/`clinical.intake.record`) sits on the identical old `rounded-md` convention, on the exact same page, but is not one of the five sections named in the brief ("treatments, appointments, lab, seminars, and pending deliveries" — intake isn't listed). Left untouched this phase — see Decision 2.

**Architecture:** No new components, no new data fetched beyond what's already queried. Two of the five sections (lab order status, lab result flags, delivery status) already render their status as plain text today — converting that text to the established tint/badge idiom is a pure presentation change using data already in the row objects passed as props. Appointments gets a new status badge column using `row.status` (already present on `AppointmentRow`, already fetched by `getAppointments`) even though the customer-page's own query (`upcomingOnly: true` → `.where('status', '==', 'scheduled')`) means every row will show the same badge today — added for forward-compatible completeness and because the brief explicitly names "appointment status" as content needing this treatment, not because it currently varies. Treatments have no status field in their type at all — no badge is fabricated for them; the table gets the same card/table structural treatment as everywhere else. See Decision 3 for badge tone choices.

## Global Constraints

- Presentation only, with one narrow, explicitly-scoped exception: adding a status-badge *column* to the appointments table and *converting* already-rendered plain-text status/flag values (lab order status, lab result flags, delivery status) into badges. No new Firestore query, no new capability check, no new field is fetched that wasn't already part of the existing row objects.
- Every one of this file's capability-derived booleans (`canManage`, `canViewCommercial`, `canViewClinical`, `canCreateTreatment`, `canManageAppointments`, `canViewLab`, `canOrderLab`, `canEnterLabResults`, `canViewSeminarAttendance`, `canFulfillDeliveries`, `canViewIntake`, `canRecordIntake`) and the page-level `requireAnyCapability([...])` call must be byte-identical before and after — same capability strings, same order, same conditional structure gating each section's render.
- Purchase History (the `canViewCommercial` block) and everything above the sections list (the `<h1>`, phone/email/address/notes block, Edit/Delete controls) must be byte-identical — confirmed already on the established convention, not touched at all.
- Every `fetch()` call, form payload shape, and `onDone`/`router.refresh()` handler in `TreatmentForm.tsx`, `LabOrderForm.tsx`, `LabResultForm.tsx`, and `PendingDeliveriesSection.tsx`'s `handleFulfill` must be byte-identical.
- `IntakeSection.tsx`, `DemographicsForm.tsx`, `NursingVisitForm.tsx` are not touched at all this phase.
- No color/font tokens outside the already-established palette.

## Decisions made explicit up front

1. **Real file scope is 7 files, not 2** — `page.tsx` (inline appointments section), `ClinicalSection.tsx`, `TreatmentForm.tsx`, `LabSection.tsx`, `LabOrderForm.tsx`, `LabResultForm.tsx`, `PendingDeliveriesSection.tsx`. The brief named the two top-level section components; the sub-forms are inseparable from their section's visual result and were found by reading the actual render tree, not assumed.
2. **`IntakeSection.tsx` (and its two sub-forms) is out of scope this phase** — it's a sixth section on the identical old convention, on the same page, but wasn't one of the five sections named in the brief. Flagged rather than silently included or silently left looking inconsistent without comment — worth a fast, obvious follow-up once this phase ships, since it'll be the one visibly stale section left on a now-mostly-restyled page.
3. **Badge tone mapping** (all using data already fetched, no new fields):
   - Lab order status: `ordered` → warning, `completed` → success.
   - Lab result flag: `normal` → success, `low` → warning, `high` → danger. This is a presentation judgment call (no existing convention in this codebase anchors low vs. high to specific tones) — flagging for confirmation rather than presenting it as an obvious default.
   - Pending delivery status: `pending` → warning, `fulfilled` → success (mirrors "completion is positive" everywhere else this project uses success, e.g. staff `active`).
   - Appointment status (defensive completeness — only `scheduled` can appear on this specific customer-page query today, but the badge dictionary covers all 4 values from `AppointmentStatus` so it doesn't silently fall through if this component is ever reused somewhere less filtered): `scheduled` → info, `completed` → success, `cancelled` → danger, `no_show` → slate.
4. **Structural convention applied identically to every table/card**: `rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]` containers (replacing every `rounded-md border border-mist`), `bg-mist/40` tinted headers, `divide-y divide-mist` rows with `hover:bg-mist/40 transition-colors duration-200`, `rounded-lg` on primary marine buttons and form inputs, `rounded-md` on secondary/bordered small buttons (matching the exact primary/secondary radius split Phase 27 already established in `LeaveReviewButtons.tsx`).

## File Structure

- `src/app/(dashboard)/customers/[id]/page.tsx` (modify) — "Upcoming appointments" section only.
- `src/components/clinical/ClinicalSection.tsx` (modify).
- `src/components/clinical/TreatmentForm.tsx` (modify).
- `src/components/clinical/LabSection.tsx` (modify).
- `src/components/clinical/LabOrderForm.tsx` (modify).
- `src/components/clinical/LabResultForm.tsx` (modify).
- `src/components/pos/PendingDeliveriesSection.tsx` (modify).

No test files — presentation-only, no component-rendering test framework in this project (per every prior design-rollout phase).

---

### Task 1: Customer detail page — "Upcoming appointments" section

**Request Opus-tier review for this task** — this file holds more independent capability gates than any other in the app; per the brief's own instruction, every gate's exact capability string and conditional structure must be confirmed unchanged, not just that the file compiles.

**Files:**
- Modify: `src/app/(dashboard)/customers/[id]/page.tsx`

**Interfaces:** none change — `AppointmentRow.status` (already fetched by `getAppointments`, already on the type) is read for the first time in this render, nothing new queried.

- [ ] **Step 1: Add a status-badge constant and restyle the "Upcoming appointments" block only**

Modify `src/app/(dashboard)/customers/[id]/page.tsx`. Add near the top of the file, after the `PurchaseRow` interface (before the `CustomerDetailPage` function):

```tsx
const APPOINTMENT_STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-info/10 text-info',
  completed: 'bg-success/10 text-success',
  cancelled: 'bg-danger/10 text-danger',
  no_show: 'bg-slate/10 text-slate',
}
```

Replace only the `{canManageAppointments && (...)}` block (everything from `{canManageAppointments && (` through its matching `)}` — do not touch anything above or below it, including the adjacent `{canViewLab && ...}`/`{canFulfillDeliveries && ...}` blocks, which stay byte-identical):

```tsx
      {canManageAppointments && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-ink">Upcoming appointments</h2>
          {upcomingAppointments.length === 0 ? (
            <p className="text-sm text-slate">No upcoming appointments.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reason</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {upcomingAppointments.map((row) => (
                    <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                      <td className="px-3 py-2 text-ink">{new Date(row.scheduledAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                      <td className="px-3 py-2 text-ink">{row.reason ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${APPOINTMENT_STATUS_BADGE[row.status] ?? 'bg-slate/10 text-slate'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link href={`/appointments/new?customerId=${id}`} className="text-sm text-marine underline-offset-2 hover:underline">
            Book appointment
          </Link>
        </div>
      )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Self-verify every capability gate is unchanged**

Read the full file after editing and confirm, line by line, that these are byte-identical to before your edit: the `requireAnyCapability([...])` array (5 strings, same order), and every one of `canManage`/`canViewCommercial`/`canViewClinical`/`canCreateTreatment`/`canManageAppointments`/`canViewLab`/`canOrderLab`/`canEnterLabResults`/`canViewSeminarAttendance`/`canFulfillDeliveries`/`canViewIntake`/`canRecordIntake` (12 `hasCapability(...)` calls, exact same capability string each). Confirm the `salesSnap` query, the `purchases` mapping, and the entire Purchase History JSX block are untouched. State this confirmation explicitly in your report — this is the brief's own explicit requirement, not optional.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/customers/[id]/page.tsx"
git commit -m "style: structural design rollout for customer page's Upcoming appointments section"
```

---

### Task 2: Treatments + seminar attendance (`ClinicalSection.tsx` + `TreatmentForm.tsx`)

**Files:**
- Modify: `src/components/clinical/ClinicalSection.tsx`
- Modify: `src/components/clinical/TreatmentForm.tsx`

**Interfaces:** none change.

- [ ] **Step 1: Restyle `ClinicalSection.tsx`**

Full file:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import TreatmentForm from './TreatmentForm'
import LabOrderForm from './LabOrderForm'
import type { TreatmentRow } from '@/lib/clinical/getPatientTreatments'
import type { SeminarAttendanceRow } from '@/lib/clinical/getSeminarAttendance'

export type { TreatmentRow }

export interface ClinicalSectionProps {
  customerId: string
  treatments: TreatmentRow[]
  canCreate: boolean
  canViewClinical: boolean
  canOrderLab: boolean
  seminarAttendance: SeminarAttendanceRow[]
  canViewSeminarAttendance: boolean
}

export default function ClinicalSection({
  customerId,
  treatments,
  canCreate,
  canViewClinical,
  canOrderLab,
  seminarAttendance,
  canViewSeminarAttendance,
}: ClinicalSectionProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [orderingForTreatmentId, setOrderingForTreatmentId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {canViewClinical && (
        <>
          <h2 className="text-lg font-medium text-ink">Clinical record</h2>
          {treatments.length === 0 ? (
            <p className="text-sm text-slate">No treatments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Diagnosis</th>
                      {canOrderLab && <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {treatments.map((row) => (
                      <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.date}</td>
                        <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                        <td className="px-3 py-2 text-ink">{row.diagnosis}</td>
                        {canOrderLab && (
                          <td className="px-3 py-2 text-ink">
                            <button
                              type="button"
                              onClick={() => setOrderingForTreatmentId((prev) => (prev === row.id ? null : row.id))}
                              className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40"
                            >
                              Order lab test
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canOrderLab && orderingForTreatmentId && (
                <LabOrderForm
                  customerId={customerId}
                  treatmentId={orderingForTreatmentId}
                  onDone={() => {
                    setOrderingForTreatmentId(null)
                    router.refresh()
                  }}
                />
              )}
            </div>
          )}

          {canCreate && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowForm((prev) => !prev)}
                className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
              >
                Add treatment
              </button>
              {showForm && (
                <TreatmentForm
                  customerId={customerId}
                  onDone={() => {
                    setShowForm(false)
                    router.refresh()
                  }}
                />
              )}
            </div>
          )}
        </>
      )}

      {canViewSeminarAttendance && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-ink">Seminar attendance</h3>
          {seminarAttendance.length === 0 ? (
            <p className="text-sm text-slate">No seminar attendance recorded.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Seminar</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {seminarAttendance.map((row) => (
                    <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                      <td className="px-3 py-2 text-ink">{new Date(row.seminarScheduledAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-ink">{row.seminarTitle}</td>
                      <td className="px-3 py-2 text-ink">{row.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Restyle `TreatmentForm.tsx`**

Replace only the JSX return block (all state/logic/`handleSubmit` untouched):

```tsx
  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Date</label>
        <input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Diagnosis</label>
        <input
          required
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Prescription (free text)</label>
        <textarea
          value={prescription}
          onChange={(e) => setPrescription(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Linked sale ID (optional)</label>
        <input
          value={linkedSaleId}
          onChange={(e) => setLinkedSaleId(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        Add treatment
      </button>
    </form>
  )
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/clinical/ClinicalSection.tsx src/components/clinical/TreatmentForm.tsx
git commit -m "style: structural design rollout for treatments and seminar attendance"
```

---

### Task 3: Lab (`LabSection.tsx` + `LabOrderForm.tsx` + `LabResultForm.tsx`)

**Files:**
- Modify: `src/components/clinical/LabSection.tsx`
- Modify: `src/components/clinical/LabOrderForm.tsx`
- Modify: `src/components/clinical/LabResultForm.tsx`

**Interfaces:** none change — `order.status` and `v.flag` (already on `LabOrderRow`) are read for badges, nothing new queried.

- [ ] **Step 1: Restyle `LabSection.tsx`**

Full file:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LabOrderForm from './LabOrderForm'
import LabResultForm from './LabResultForm'
import type { LabOrderRow } from '@/lib/clinical/getLabRecords'

export interface LabSectionProps {
  customerId: string
  orders: LabOrderRow[]
  canOrder: boolean
  canEnterResults: boolean
}

const ORDER_STATUS_BADGE: Record<string, string> = {
  ordered: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
}

const FLAG_BADGE: Record<string, string> = {
  normal: 'bg-success/10 text-success',
  low: 'bg-warning/10 text-warning',
  high: 'bg-danger/10 text-danger',
}

export default function LabSection({ customerId, orders, canOrder, canEnterResults }: LabSectionProps) {
  const router = useRouter()
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [resultsOrderId, setResultsOrderId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-ink">Lab orders</h2>
      {orders.length === 0 ? (
        <p className="text-sm text-slate">No lab orders yet.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="space-y-2 rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-ink">{order.testName}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate">
                    <span>Ordered {new Date(order.orderedAt).toLocaleString()} by {order.doctorName}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_BADGE[order.status] ?? 'bg-slate/10 text-slate'}`}>
                      {order.status}
                    </span>
                  </div>
                  {order.instructions && <div className="text-xs text-slate">Instructions: {order.instructions}</div>}
                </div>
                {canEnterResults && order.status === 'ordered' && (
                  <button
                    type="button"
                    onClick={() => setResultsOrderId((prev) => (prev === order.id ? null : order.id))}
                    className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40"
                  >
                    Enter results
                  </button>
                )}
              </div>
              {order.result ? (
                <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-mist/40">
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Parameter</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Value</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Unit</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reference range</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Flag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mist">
                      {order.result.values.map((v, i) => (
                        <tr key={i} className="hover:bg-mist/40 transition-colors duration-200">
                          <td className="px-3 py-2 text-ink">{v.parameter}</td>
                          <td className="px-3 py-2 font-mono text-right text-ink">{v.value}</td>
                          <td className="px-3 py-2 text-ink">{v.unit ?? '—'}</td>
                          <td className="px-3 py-2 text-ink">{v.referenceRange ?? '—'}</td>
                          <td className="px-3 py-2">
                            {v.flag ? (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${FLAG_BADGE[v.flag] ?? 'bg-slate/10 text-slate'}`}>
                                {v.flag}
                              </span>
                            ) : (
                              <span className="text-ink">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {order.result.notes && (
                    <p className="border-t border-mist px-3 py-2 text-xs text-ink">Note: {order.result.notes}</p>
                  )}
                  <p className="px-3 py-2 text-xs text-slate">
                    Entered {new Date(order.result.enteredAt).toLocaleString()} by {order.result.enteredByName}
                  </p>
                </div>
              ) : (
                resultsOrderId === order.id && (
                  <LabResultForm
                    labOrderId={order.id}
                    onDone={() => {
                      setResultsOrderId(null)
                      router.refresh()
                    }}
                  />
                )
              )}
            </div>
          ))}
        </div>
      )}

      {canOrder && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowOrderForm((prev) => !prev)}
            className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
          >
            Order lab test
          </button>
          {showOrderForm && (
            <LabOrderForm
              customerId={customerId}
              onDone={() => {
                setShowOrderForm(false)
                router.refresh()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
```

**Note on `v.value` gaining `font-mono text-right`**: this is the one cell in this table holding a numeric-or-textual lab value (this project's established convention treats numeric-looking data columns as `font-mono`, e.g. Payroll's gross amount, Expenses' amount). `LabResult.values[].value` is typed as a free-text string (a lab value can be non-numeric, e.g. "positive"/"negative"), so this is a presentation choice applied uniformly to the column, not a type-driven one — flagging this as a minor judgment call for the task reviewer, not asserting it's obviously correct.

- [ ] **Step 2: Restyle `LabOrderForm.tsx`**

Replace only the JSX return block:

```tsx
  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Test name</label>
        <input
          required
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          placeholder="e.g. Complete Blood Count"
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Instructions (optional)</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        Order lab test
      </button>
    </form>
  )
```

- [ ] **Step 3: Restyle `LabResultForm.tsx`**

Replace only the JSX return block (the multi-row grid form):

```tsx
  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-5 items-end gap-2">
          <div>
            <label className="block text-xs font-medium text-ink">Parameter</label>
            <input
              required
              value={row.parameter}
              onChange={(e) => updateRow(i, 'parameter', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink">Value</label>
            <input
              required
              value={row.value}
              onChange={(e) => updateRow(i, 'value', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink">Unit</label>
            <input
              value={row.unit}
              onChange={(e) => updateRow(i, 'unit', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink">Reference range</label>
            <input
              value={row.referenceRange}
              onChange={(e) => updateRow(i, 'referenceRange', e.target.value)}
              className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
            />
          </div>
          <div className="flex items-end gap-1">
            <div className="flex-1">
              <label className="block text-xs font-medium text-ink">Flag</label>
              <select
                value={row.flag}
                onChange={(e) => updateRow(i, 'flag', e.target.value)}
                className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
              >
                <option value="">—</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
                <option value="high">High</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={rows.length === 1}
              className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40 disabled:opacity-50"
            >
              −
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40"
      >
        + Add row
      </button>
      <div>
        <label className="block text-xs font-medium text-ink">Feedback / review note (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-2 py-1 text-sm text-ink focus:border-marine"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          Save results
        </button>
      </div>
    </form>
  )
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/clinical/LabSection.tsx src/components/clinical/LabOrderForm.tsx src/components/clinical/LabResultForm.tsx
git commit -m "style: structural design rollout for lab orders and results"
```

---

### Task 4: Pending deliveries (`PendingDeliveriesSection.tsx`)

**Files:**
- Modify: `src/components/pos/PendingDeliveriesSection.tsx`

**Interfaces:** none change.

- [ ] **Step 1: Restyle the full file**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PendingDeliveryRow } from '@/lib/pos/getPendingDeliveries'

export interface PendingDeliveriesSectionProps {
  deliveries: PendingDeliveryRow[]
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  fulfilled: 'bg-success/10 text-success',
}

export default function PendingDeliveriesSection({ deliveries }: PendingDeliveriesSectionProps) {
  const router = useRouter()
  const [fulfillingId, setFulfillingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFulfill(id: string) {
    setError(null)
    setFulfillingId(id)
    try {
      const res = await fetch(`/api/pending-deliveries/${id}/fulfill`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not mark this delivery as fulfilled — check your connection and try again.')
        return
      }
      router.refresh()
    } finally {
      setFulfillingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium text-ink">Pending deliveries</h2>
      {deliveries.length === 0 ? (
        <p className="text-sm text-slate">No pending deliveries.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Qty owed</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{d.productName}</td>
                  <td className="px-3 py-2 font-mono text-right text-ink">{d.quantityOwed}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[d.status] ?? 'bg-slate/10 text-slate'}`}>
                      {d.status}
                    </span>
                    {d.status === 'fulfilled' && (
                      <span className="ml-2 text-xs text-slate">
                        {d.fulfilledByName ? `by ${d.fulfilledByName}` : ''}{d.fulfilledAt ? ` on ${new Date(d.fulfilledAt).toLocaleString()}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    {d.status === 'pending' && (
                      <button
                        type="button"
                        disabled={fulfillingId === d.id}
                        onClick={() => handleFulfill(d.id)}
                        className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist/40 disabled:opacity-50"
                      >
                        Mark fulfilled
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
```

**Note**: the "Fulfilled by X on Y" detail moves from being concatenated inside the status cell's text to a separate `<span>` next to the new badge, since the badge itself now only ever reads "pending"/"fulfilled" — this preserves every piece of information the original plain-text cell showed (status word, fulfiller name, fulfillment timestamp), just split across the badge + a secondary text span instead of one long string. Confirm this reads correctly in task review; it's the one section-4 change worth double-checking wasn't a silent content loss.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/pos/PendingDeliveriesSection.tsx
git commit -m "style: structural design rollout for pending deliveries"
```

---

### Task 5: Full-suite verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all 470 tests still pass, zero regressions (presentation-only phase, no new application-code tests).

- [ ] **Step 2: Confirm every capability gate, per-gate, not just page-level**

Read the final `customers/[id]/page.tsx` and confirm each of these 13 checks individually returns the same capability string as the pre-phase version (recorded in this plan's Global Constraints section): `requireAnyCapability` (5-element array), then the 12 `hasCapability(user.role, '...')` calls. This is the brief's own explicit exit criterion — verify per-gate, not just "the page still compiles."

- [ ] **Step 3: Confirm data logic is unchanged, by reading, not re-testing**

Confirm `TreatmentForm.tsx`'s `handleSubmit`/fetch/payload, `LabOrderForm.tsx`'s `handleSubmit`/fetch/payload, `LabResultForm.tsx`'s `handleSubmit`/fetch/payload/row-management functions, and `PendingDeliveriesSection.tsx`'s `handleFulfill`/fetch call are all byte-identical to their pre-phase versions. Confirm Purchase History's query/mapping/JSX in `page.tsx` was never touched (it wasn't part of any task's diff).

- [ ] **Step 4: Live verification (attempt — reachable last phase for the first time in six tries, worth trying again)**

If browser automation is reachable: sign in as a real `doctor`/`nurse`/`protocol`/`lab_staff` account and confirm each role's exact same visibility as before the phase — a `nurse` sees only intake-adjacent content plus lab (per `LAB_VIEW_ROLES`), never treatments/appointments; `protocol` sees only seminar attendance; a `doctor` sees treatments/appointments/lab with full authoring controls. Add a real treatment, order a real lab test, enter results, confirm badges render with the correct tone. If unreachable: say so plainly, matching this phase's own explicit instruction not to present the code-level checks above as equivalent to a visual check.

---

## After all tasks: CLAUDE.md and completion report

Once Task 5 passes, write `docs/superpowers/plans/2026-07-19-phase-28-clinical-design-rollout-completion.md` and update `CLAUDE.md`'s "Current status"/design-system coverage note to reflect Phase 28 as shipped, including the `IntakeSection.tsx` flag as a named, deliberate exclusion (not an oversight) for the next tranche. Tag `phase-28-baseline` only if the user explicitly requests it.
