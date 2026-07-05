# Phase 14 — Appointments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add appointment scheduling for doctor visits — staff book on a patient's behalf against a specific doctor, with double-booking prevention and a new `clinical.appointments.manage` capability. No patient-facing booking, no doctor availability configuration, no link back to `treatments`.

**Architecture:** A new `appointments` collection, fully closed in Firestore rules like `treatments`/`leaveRequests`. One capability (`clinical.appointments.manage`) covers create/view/reschedule/cancel/complete — no create-vs-view split, unlike `clinical.record.*`. Granted to the same four roles as `clinical.record.view` today (`super_admin`, `admin`, `doctor`, `medical_secretary`) by reusing `CLINICAL_VIEW_ROLES` directly — **not** the five-role group the brief describes (which also includes `general_manager`), per explicit user decision below. Double-booking prevention is a transaction-safe overlap check, same read-check-write discipline as stock movements. A new Cloud Function trigger notifies the assigned doctor, following the exact `onLowStock`/`onLeaveRequestSubmitted` pattern. Every appointment *view*, not just create/update, gets its own audit log entry via one shared helper — the same discipline Phase 13 established for `treatments`.

**Tech Stack:** Same as the rest of the app — Next.js Server Components + API routes, Firebase Admin SDK, Firestore, Cloud Functions v2.

## Global Constraints

- No patient-facing booking capability of any kind — every entry point requires `clinical.appointments.manage`.
- No doctor working-hours/availability configuration, no recurring appointments — any date/time can be proposed; only an actual overlap with the *same doctor's* other `scheduled` appointments is rejected.
- No link from `treatments` back to the appointment that produced it — `api/treatments/route.ts` is not touched by this phase at all.
- `appointments`: no direct client read or write in Firestore rules — same closed pattern as `treatments`/`leaveRequests`/`attendanceRecords`/`notifications`.
- `doctorUid`/`branchId` are always server-derived — `branchId` is read off the target doctor's own `staff` doc, never accepted from the client, never assumed to be the *creator's* branch (the creator may be a `medical_secretary` booking on the doctor's behalf, not the doctor themselves).
- Viewing the appointment schedule (in any filtered form) must produce its own `appointment_view` audit log entry, via one shared call site — the same "true by construction" discipline as `getPatientTreatments`.
- The customer detail page's existing Purchase History and Clinical record sections must be provably unchanged — diffed against the pre-phase version, same standard as every phase that has touched that file so far (9, 11, 12, 13).

## Decisions requiring your sign-off before implementation

### 1. `general_manager` doesn't exist as a role yet — resolved

The brief's access group is `doctor`, `medical_secretary`, `general_manager`, `admin`, `super_admin`. `general_manager` is not in `ROLES` (`src/lib/auth/permissions.ts`) — it's still a CLAUDE.md proposal awaiting its own build phase, the same reason `clinical.record.view`'s *actual* grant set today (`CLINICAL_VIEW_ROLES`) is already missing it despite CLAUDE.md saying it should be there.

**Resolved by explicit user decision:** grant `clinical.appointments.manage` to `CLINICAL_VIEW_ROLES` exactly (`super_admin`, `admin`, `doctor`, `medical_secretary`) — reusing the existing constant, not a new one. No role-system changes in this phase. When `general_manager` eventually ships, that phase must retrofit it onto **both** `clinical.record.view` and `clinical.appointments.manage` (both currently read `CLINICAL_VIEW_ROLES`), not just one — noted as a comment at the constant's definition site (Task 1).

### 2. A `cancellationReason` field is added, beyond the brief's literal Data Model list

The brief's Data Model section lists `reason` (reason for visit, set at booking time) but no field for a reason given at cancellation time — yet the Scheduling Mechanics section explicitly discusses "a cancellation reason" as its own optional concept ("not required — this isn't the same trust boundary as voiding a sale"), which only makes sense if it's captured somewhere. The closest existing analog this comparison points to is void-sale's `voidedAt`/`voidedBy`/`voidReason` doc annotation.

**Inferred addition (flagging rather than guessing silently):** `appointments` gets `cancelledAt: Timestamp | null`, `cancelledBy: string | null`, `cancellationReason: string | null`, populated only on a `status: 'cancelled'` transition, left `null` otherwise. If this isn't what was meant, it's a small, isolated field set to drop.

### 3. `GET /api/appointments`'s exposed filter surface is narrower than `getAppointments`'s internal capability

The brief's "schedule/list view (filterable by doctor, sorted by date)" only ever needs a `doctorUid` filter over HTTP. The customer detail page's "Upcoming appointments" section needs `customerId` + `upcomingOnly` filtering too, but — mirroring `getPatientTreatments`'s own precedent — it calls the shared helper (`getAppointments`, Task 3) directly as a Server Component, never through the HTTP route. So `GET /api/appointments` only ever accepts an optional `doctorUid` query param; `getAppointments` itself supports `customerId`/`upcomingOnly` for direct in-process callers. This keeps the two composite indexes in Task 2 sufficient — no index is needed for a `customerId`-filtered-without-`upcomingOnly` query shape, because nothing calls it.

### 4. `doctorUid` is validated against a real `staff` doc with `role === 'doctor'`

Not explicitly required by the brief's validation text, but consistent with this project's established "validate a reference field against a real doc" discipline (`customerId` in `POST /api/treatments`, `linkedSaleId` likewise, `branchId` in staff/department creation). Booking an appointment against a UID that doesn't belong to an actual doctor would silently corrupt `branchId` derivation (Constraint above) and the notification trigger's recipient. Rejected with 400 if the referenced staff doc doesn't exist or isn't a doctor.

### 5. Customer deletion doesn't check `appointments` — not fixed, matches an already-anticipated gap

`docs/tech-debt.md`'s TD-3 (via CLAUDE.md's "Known-issues policy" section) already anticipates this exact situation: "appointments and lab results will be the same problem again" once they exist. This phase's work never touches `src/app/api/customers/[id]/route.ts`'s `DELETE` handler, so per the project's own known-issues policy ("if it doesn't touch that area, just re-flag it rather than going out of scope") this is **not** fixed here — a customer with upcoming/past appointments can still be deleted through the app, same as one with `treatments`. Flagged in the completion report; no code task for it in this plan.

## Task 1: Permissions, types, notification wiring

**Review tier: Opus** (capability grant + access-control wiring, matching this project's practice for Phase 13's equivalent task).

1. `src/lib/auth/permissions.ts` — Modify:
   - Change `'clinical.appointments.manage': [],` to `'clinical.appointments.manage': CLINICAL_VIEW_ROLES,` in `ROLE_CAPABILITIES`.
   - Add a comment directly above the `CLINICAL_VIEW_ROLES` definition:
     ```ts
     // Backs both clinical.record.view and clinical.appointments.manage (Phase
     // 14). When general_manager ships as a real role, it must be added HERE —
     // retrofitting both capabilities at once, not just one — per CLAUDE.md's
     // "hybrid business" section, which says general_manager gets full clinical
     // read access. Not added yet: general_manager doesn't exist in ROLES.
     const CLINICAL_VIEW_ROLES: RoleId[] = ['super_admin', 'admin', 'doctor', 'medical_secretary']
     ```
   - Do not add a new role-group constant. Do not touch `CLINICAL_ROLES`, `ROLES`, `BRANCH_LOCKED_ROLES`, or any other capability's role list.

2. `src/lib/types/audit.ts` — Modify: add `| 'appointment_create' | 'appointment_update' | 'appointment_view'` to the `AuditAction` union, after the existing `'clinical_record_create' | 'clinical_record_view'` line. Nothing else changes.

3. `src/lib/types/appointment.ts` — Create:
   ```ts
   export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

   export interface Appointment {
     id: string
     customerId: string
     doctorUid: string
     branchId: string
     scheduledAt: FirebaseFirestore.Timestamp
     durationMinutes: number
     status: AppointmentStatus
     reason: string | null
     cancelledAt: FirebaseFirestore.Timestamp | null
     cancelledBy: string | null
     cancellationReason: string | null
     createdBy: string
     createdAt: FirebaseFirestore.Timestamp
     updatedAt: FirebaseFirestore.Timestamp
   }
   ```

4. `src/lib/types/notification.ts` — Modify: change the `NotificationType` union to
   ```ts
   export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed' | 'appointment_scheduled'
   ```
   Nothing else in this file changes.

5. `src/components/notifications/NotificationBell.tsx` — Modify: add an entry to `NOTIFICATION_LINKS`:
   ```ts
   const NOTIFICATION_LINKS: Record<NotificationType, (relatedId: string) => string> = {
     low_stock: (relatedId) => `/products/${relatedId}`,
     leave_request_submitted: () => '/leave/review',
     leave_request_reviewed: () => '/leave',
     appointment_scheduled: () => '/appointments',
   }
   ```
   Nothing else in this file changes. (This is a required edit, not optional — `Record<NotificationType, ...>` is exhaustively typed, so the build fails without it once `NotificationType` gains a new member.)

**Verification this task must perform (state explicitly in the report):** walk every entry in `ROLE_CAPABILITIES` after your edit and confirm `clinical.appointments.manage`'s role list is character-for-character identical to `clinical.record.view`'s (`CLINICAL_VIEW_ROLES`, both referencing the same constant) — this is the literal outcome of Decision #1 and is fully mechanical to verify by inspection.

## Task 2: Firestore rules + composite indexes

**Review tier: Sonnet** (mechanical, same shape as existing entries).

6. `firestore.rules` — Modify: add, immediately before the final catch-all `match /{document=**}` block, alongside the other fully-closed collections:
   ```
   match /appointments/{appointmentId} {
     allow read, write: if false; // all access goes through /api/appointments — clinical-adjacent scheduling data, same fully-closed treatment as treatments/leaveRequests/attendanceRecords/notifications, plus every read is separately audit-logged server-side
   }
   ```

7. `firestore.indexes.json` — Modify: add two composite indexes to the existing `indexes` array:
   ```json
   {
     "collectionGroup": "appointments",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "doctorUid", "order": "ASCENDING" },
       { "fieldPath": "scheduledAt", "order": "ASCENDING" }
     ]
   },
   {
     "collectionGroup": "appointments",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "customerId", "order": "ASCENDING" },
       { "fieldPath": "status", "order": "ASCENDING" },
       { "fieldPath": "scheduledAt", "order": "ASCENDING" }
     ]
   }
   ```
   The first backs the doctor-filtered schedule query (Task 6); the second backs the customer detail page's "upcoming, scheduled-only" query (Task 7). The unfiltered "all appointments, sorted by date" query and the transaction's overlap-check query (equality-only on `doctorUid`+`status`, no order) both need no composite index — confirmed against this codebase's existing precedent (`leaveNotifications.ts`'s `role`+`branchId` equality-only query has no matching entry in this file either). Nothing else in either file changes.

## Task 3: Overlap-check helper + shared view/audit helper

**Review tier: Opus** (this is the actual double-booking-prevention logic and the audit-on-read guarantee — the two properties this phase is explicitly judged on).

8. `src/lib/clinical/appointmentOverlap.ts` — Create:
   ```ts
   import type { Firestore, Transaction } from 'firebase-admin/firestore'

   // Only 'scheduled' appointments can conflict — a cancelled/completed/no_show
   // appointment no longer occupies the doctor's time. Called inside a
   // transaction by both POST /api/appointments (create) and PATCH
   // /api/appointments/[id] (reschedule) so the read-check-write is atomic
   // with the write that follows it, the same discipline as every stock
   // transaction in this app. excludeAppointmentId lets a reschedule ignore
   // the appointment's own prior slot when checking for conflicts.
   export async function findOverlappingAppointment(
     tx: Transaction,
     db: Firestore,
     doctorUid: string,
     start: Date,
     end: Date,
     excludeAppointmentId?: string
   ): Promise<string | null> {
     const query = db.collection('appointments').where('doctorUid', '==', doctorUid).where('status', '==', 'scheduled')
     const snap = await tx.get(query)
     for (const doc of snap.docs) {
       if (doc.id === excludeAppointmentId) continue
       const data = doc.data()
       const existingStart = (data.scheduledAt as FirebaseFirestore.Timestamp).toDate()
       const existingEnd = new Date(existingStart.getTime() + (data.durationMinutes as number) * 60_000)
       if (start < existingEnd && existingStart < end) return doc.id
     }
     return null
   }
   ```

9. `src/lib/clinical/getAppointments.ts` — Create:
   ```ts
   import { getAdminFirestore } from '@/lib/firebase/admin'
   import { writeAuditLog } from '@/lib/audit/log'
   import { hasCapability } from '@/lib/auth/permissions'
   import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
   import type { Appointment, AppointmentStatus } from '@/lib/types/appointment'

   export interface AppointmentRow {
     id: string
     customerId: string
     customerName: string
     doctorUid: string
     doctorName: string
     scheduledAt: string
     durationMinutes: number
     status: AppointmentStatus
     reason: string | null
     cancellationReason: string | null
   }

   export interface AppointmentFilters {
     doctorUid?: string
     customerId?: string
     upcomingOnly?: boolean
   }

   // Called by both GET /api/appointments and any page listing appointments
   // (the schedule page in Task 6, the customer detail page's "Upcoming
   // appointments" section in Task 7) — same single-call-site-for-audit-
   // logging discipline as getPatientTreatments, so "viewing the schedule is
   // read-audit-logged" is true by construction rather than by two copies
   // staying in sync. Re-checks the capability itself rather than trusting
   // the caller already did, same belt-and-suspenders discipline as
   // getPatientTreatments/StaffTable's super_admin delete guard.
   export async function getAppointments(filters: AppointmentFilters, viewer: SessionUser): Promise<AppointmentRow[]> {
     if (!hasCapability(viewer.role, 'clinical.appointments.manage')) {
       throw new AuthError('Forbidden', 403)
     }

     const db = getAdminFirestore()
     let query: FirebaseFirestore.Query = db.collection('appointments')
     if (filters.customerId) query = query.where('customerId', '==', filters.customerId)
     if (filters.doctorUid) query = query.where('doctorUid', '==', filters.doctorUid)
     if (filters.upcomingOnly) {
       query = query.where('status', '==', 'scheduled').where('scheduledAt', '>=', new Date())
     }
     query = query.orderBy('scheduledAt', 'asc')
     const snap = await query.get()

     const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as Appointment }))
     const uniqueDoctorUids = Array.from(new Set(docs.map((d) => d.data.doctorUid)))
     const uniqueCustomerIds = Array.from(new Set(docs.map((d) => d.data.customerId)))
     const [doctorDocs, customerDocs] = await Promise.all([
       Promise.all(uniqueDoctorUids.map((uid) => db.collection('staff').doc(uid).get())),
       Promise.all(uniqueCustomerIds.map((id) => db.collection('customers').doc(id).get())),
     ])
     const doctorNames: Record<string, string> = {}
     uniqueDoctorUids.forEach((uid, i) => {
       doctorNames[uid] = (doctorDocs[i].data()?.name as string | undefined) ?? uid
     })
     const customerNames: Record<string, string> = {}
     uniqueCustomerIds.forEach((id, i) => {
       customerNames[id] = (customerDocs[i].data()?.name as string | undefined) ?? id
     })

     const rows: AppointmentRow[] = docs.map(({ id, data }) => ({
       id,
       customerId: data.customerId,
       customerName: customerNames[data.customerId] ?? data.customerId,
       doctorUid: data.doctorUid,
       doctorName: doctorNames[data.doctorUid] ?? data.doctorUid,
       scheduledAt: data.scheduledAt.toDate().toISOString(),
       durationMinutes: data.durationMinutes,
       status: data.status,
       reason: data.reason,
       cancellationReason: data.cancellationReason,
     }))

     await writeAuditLog({
       action: 'appointment_view',
       actorUid: viewer.uid,
       actorEmail: viewer.email,
       targetUid: filters.customerId ?? null,
       branchId: null,
       details: null,
     })

     return rows
   }
   ```

**Interfaces produced for Tasks 4/6/7:** `findOverlappingAppointment(tx, db, doctorUid, start, end, excludeAppointmentId?) => Promise<string | null>` from `@/lib/clinical/appointmentOverlap`; `getAppointments(filters, viewer) => Promise<AppointmentRow[]>` and the `AppointmentRow`/`AppointmentFilters` shapes from `@/lib/clinical/getAppointments`.

## Task 4: API routes (create + status transitions/reschedule)

**Review tier: Opus** (the transaction-guarded create path and the reschedule path both call Task 3's overlap check under a real Firestore transaction — high-stakes by this project's own established bar).

10. `src/app/api/appointments/route.ts` — Create:
    ```ts
    import { NextResponse } from 'next/server'
    import { getAdminFirestore } from '@/lib/firebase/admin'
    import { requireCapability, AuthError } from '@/lib/auth/server-guard'
    import { writeAuditLog } from '@/lib/audit/log'
    import { getAppointments } from '@/lib/clinical/getAppointments'
    import { findOverlappingAppointment } from '@/lib/clinical/appointmentOverlap'

    const DEFAULT_DURATION_MINUTES = 30

    function isNonEmptyString(value: unknown): value is string {
      return typeof value === 'string' && value.trim().length > 0
    }

    export async function GET(request: Request) {
      try {
        const user = await requireCapability('clinical.appointments.manage')
        const { searchParams } = new URL(request.url)
        const doctorUid = searchParams.get('doctorUid')
        const rows = await getAppointments({ doctorUid: doctorUid ?? undefined }, user)
        return NextResponse.json(rows)
      } catch (err) {
        if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
        throw err
      }
    }

    export async function POST(request: Request) {
      try {
        const user = await requireCapability('clinical.appointments.manage')
        const body = await request.json()

        if (!isNonEmptyString(body.customerId)) {
          return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
        }
        if (!isNonEmptyString(body.doctorUid)) {
          return NextResponse.json({ error: 'doctorUid is required' }, { status: 400 })
        }
        if (!isNonEmptyString(body.scheduledAt)) {
          return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })
        }
        const scheduledAt = new Date(body.scheduledAt)
        if (Number.isNaN(scheduledAt.getTime())) {
          return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 })
        }

        let durationMinutes = DEFAULT_DURATION_MINUTES
        if ('durationMinutes' in body && body.durationMinutes !== undefined && body.durationMinutes !== null) {
          if (typeof body.durationMinutes !== 'number' || !Number.isInteger(body.durationMinutes) || body.durationMinutes <= 0) {
            return NextResponse.json({ error: 'durationMinutes must be a positive integer' }, { status: 400 })
          }
          durationMinutes = body.durationMinutes
        }

        let reason: string | null = null
        if ('reason' in body && body.reason !== undefined && body.reason !== null && body.reason !== '') {
          if (!isNonEmptyString(body.reason)) {
            return NextResponse.json({ error: 'reason must be a string or null' }, { status: 400 })
          }
          reason = body.reason.trim()
        }

        const db = getAdminFirestore()
        const customerId = body.customerId.trim()
        const doctorUid = body.doctorUid.trim()

        const customerSnap = await db.collection('customers').doc(customerId).get()
        if (!customerSnap.exists) {
          return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
        }
        const doctorSnap = await db.collection('staff').doc(doctorUid).get()
        if (!doctorSnap.exists || doctorSnap.data()?.role !== 'doctor') {
          return NextResponse.json({ error: 'doctorUid does not reference a doctor' }, { status: 400 })
        }
        const doctorBranchId = doctorSnap.data()!.branchId as string

        const scheduledEnd = new Date(scheduledAt.getTime() + durationMinutes * 60_000)
        const apptRef = db.collection('appointments').doc()

        try {
          await db.runTransaction(async (tx) => {
            const conflictId = await findOverlappingAppointment(tx, db, doctorUid, scheduledAt, scheduledEnd)
            if (conflictId) {
              throw new AuthError('This doctor already has an appointment overlapping that time', 409)
            }
            tx.set(apptRef, {
              customerId,
              doctorUid,
              branchId: doctorBranchId,
              scheduledAt,
              durationMinutes,
              status: 'scheduled',
              reason,
              cancelledAt: null,
              cancelledBy: null,
              cancellationReason: null,
              createdBy: user.uid,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          })
        } catch (err) {
          if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
          throw err
        }

        await writeAuditLog({
          action: 'appointment_create',
          actorUid: user.uid,
          actorEmail: user.email,
          targetUid: customerId,
          branchId: doctorBranchId,
          details: null,
        })

        return NextResponse.json({ id: apptRef.id }, { status: 201 })
      } catch (err) {
        if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
        throw err
      }
    }
    ```

11. `src/app/api/appointments/[id]/route.ts` — Create:
    ```ts
    import { NextResponse } from 'next/server'
    import { getAdminFirestore } from '@/lib/firebase/admin'
    import { requireCapability, AuthError } from '@/lib/auth/server-guard'
    import { writeAuditLog } from '@/lib/audit/log'
    import { findOverlappingAppointment } from '@/lib/clinical/appointmentOverlap'

    const TERMINAL_STATUSES = ['completed', 'cancelled', 'no_show'] as const
    type TerminalStatus = (typeof TERMINAL_STATUSES)[number]

    function isTerminalStatus(value: unknown): value is TerminalStatus {
      return TERMINAL_STATUSES.includes(value as TerminalStatus)
    }

    function isNonEmptyString(value: unknown): value is string {
      return typeof value === 'string' && value.trim().length > 0
    }

    export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
      try {
        const user = await requireCapability('clinical.appointments.manage')
        const { id } = await params
        const body = await request.json()

        const db = getAdminFirestore()
        const apptRef = db.collection('appointments').doc(id)
        const apptSnap = await apptRef.get()
        if (!apptSnap.exists) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
        const appt = apptSnap.data()!
        if (appt.status !== 'scheduled') {
          return NextResponse.json({ error: 'Only a scheduled appointment can be updated' }, { status: 409 })
        }

        const hasStatus = 'status' in body && body.status !== undefined
        const hasReschedule = 'scheduledAt' in body && body.scheduledAt !== undefined
        if (hasStatus === hasReschedule) {
          return NextResponse.json({ error: 'Provide exactly one of status or scheduledAt' }, { status: 400 })
        }

        if (hasStatus) {
          if (!isTerminalStatus(body.status)) {
            return NextResponse.json({ error: 'status must be one of completed, cancelled, no_show' }, { status: 400 })
          }
          let cancellationReason: string | null = null
          if (
            body.status === 'cancelled' &&
            'cancellationReason' in body &&
            body.cancellationReason !== undefined &&
            body.cancellationReason !== null &&
            body.cancellationReason !== ''
          ) {
            if (!isNonEmptyString(body.cancellationReason)) {
              return NextResponse.json({ error: 'cancellationReason must be a string or null' }, { status: 400 })
            }
            cancellationReason = body.cancellationReason.trim()
          }

          await apptRef.update({
            status: body.status,
            ...(body.status === 'cancelled'
              ? { cancelledAt: new Date(), cancelledBy: user.uid, cancellationReason }
              : {}),
            updatedAt: new Date(),
          })
        } else {
          if (!isNonEmptyString(body.scheduledAt)) {
            return NextResponse.json({ error: 'scheduledAt must be a non-empty string' }, { status: 400 })
          }
          const scheduledAt = new Date(body.scheduledAt)
          if (Number.isNaN(scheduledAt.getTime())) {
            return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 })
          }
          let durationMinutes = appt.durationMinutes as number
          if ('durationMinutes' in body && body.durationMinutes !== undefined && body.durationMinutes !== null) {
            if (typeof body.durationMinutes !== 'number' || !Number.isInteger(body.durationMinutes) || body.durationMinutes <= 0) {
              return NextResponse.json({ error: 'durationMinutes must be a positive integer' }, { status: 400 })
            }
            durationMinutes = body.durationMinutes
          }
          const scheduledEnd = new Date(scheduledAt.getTime() + durationMinutes * 60_000)

          try {
            await db.runTransaction(async (tx) => {
              const conflictId = await findOverlappingAppointment(tx, db, appt.doctorUid as string, scheduledAt, scheduledEnd, id)
              if (conflictId) {
                throw new AuthError('This doctor already has an appointment overlapping that time', 409)
              }
              tx.update(apptRef, { scheduledAt, durationMinutes, updatedAt: new Date() })
            })
          } catch (err) {
            if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
            throw err
          }
        }

        await writeAuditLog({
          action: 'appointment_update',
          actorUid: user.uid,
          actorEmail: user.email,
          targetUid: appt.customerId as string,
          branchId: appt.branchId as string,
          details: hasStatus ? { status: body.status } : { rescheduled: true },
        })

        return NextResponse.json({ ok: true })
      } catch (err) {
        if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
        throw err
      }
    }
    ```

**Interfaces produced for Tasks 6/7:** `POST /api/appointments` accepting `{ customerId, doctorUid, scheduledAt, durationMinutes?, reason? }`, returning `{ id }`; `GET /api/appointments?doctorUid=` returning `AppointmentRow[]`; `PATCH /api/appointments/[id]` accepting either `{ status, cancellationReason? }` or `{ scheduledAt, durationMinutes? }`.

## Task 5: Cloud Function notification trigger

**Review tier: Sonnet** (follows an exact existing template, no new architecture).

12. `functions/src/appointmentNotifications.ts` — Create:
    ```ts
    import { onDocumentCreated } from 'firebase-functions/v2/firestore'
    import { getFunctionsFirestore } from './firestore'
    import { isAlreadyExistsError } from './idempotent'

    function formatDateTime(ts: FirebaseFirestore.Timestamp): string {
      return ts.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    }

    export const onAppointmentScheduled = onDocumentCreated(
      { document: 'appointments/{appointmentId}', database: 'default' },
      async (event) => {
        const appointment = event.data?.data()
        if (!appointment) return

        const { doctorUid, customerId, scheduledAt } = appointment as {
          doctorUid: string
          customerId: string
          scheduledAt: FirebaseFirestore.Timestamp
        }

        const db = getFunctionsFirestore()
        const customerSnap = await db.collection('customers').doc(customerId).get()
        const customerName = customerSnap.exists ? (customerSnap.data()!.name as string) : customerId

        const appointmentId = event.params.appointmentId
        const notifRef = db.collection('notifications').doc(`appointment_scheduled_${appointmentId}`)
        try {
          await notifRef.create({
            recipientUid: doctorUid,
            type: 'appointment_scheduled',
            title: 'New appointment',
            body: `${customerName} — ${formatDateTime(scheduledAt)}.`,
            relatedId: appointmentId,
            read: false,
            createdAt: new Date(),
          })
        } catch (err) {
          if (!isAlreadyExistsError(err)) throw err
        }
      }
    )
    ```

13. `functions/src/index.ts` — Modify: add `export { onAppointmentScheduled } from './appointmentNotifications'`. Nothing else changes — `onLowStock`/`onLeaveRequestSubmitted`/`onLeaveRequestReviewed` exports untouched.

## Task 6: UI — booking form, schedule page, sidebar nav

**Review tier: Sonnet** (CRUD/UI, no new access-control surface — every check already lives server-side in Tasks 1/4).

14. `src/components/appointments/AppointmentForm.tsx` — Create. `'use client'`:
    ```tsx
    'use client'
    import { useState } from 'react'
    import { useRouter } from 'next/navigation'

    export interface AppointmentFormProps {
      customers: { id: string; name: string; phone: string }[]
      doctors: { id: string; name: string }[]
      defaultCustomerId?: string
    }

    export default function AppointmentForm({ customers, doctors, defaultCustomerId }: AppointmentFormProps) {
      const router = useRouter()
      const [customerId, setCustomerId] = useState(defaultCustomerId ?? '')
      const [customerSearch, setCustomerSearch] = useState('')
      const [doctorUid, setDoctorUid] = useState('')
      const [scheduledAt, setScheduledAt] = useState('')
      const [durationMinutes, setDurationMinutes] = useState('30')
      const [reason, setReason] = useState('')
      const [error, setError] = useState<string | null>(null)
      const [submitting, setSubmitting] = useState(false)

      const customerQuery = customerSearch.trim().toLowerCase()
      const filteredCustomers = customerQuery
        ? customers.filter((c) => c.name.toLowerCase().includes(customerQuery) || c.phone.toLowerCase().includes(customerQuery))
        : customers

      async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setSubmitting(true)

        try {
          const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerId,
              doctorUid,
              scheduledAt: new Date(scheduledAt).toISOString(),
              durationMinutes: Number(durationMinutes),
              reason: reason.trim() || null,
            }),
          })
          const body = await res.json()
          if (!res.ok) {
            setError(body.error ?? 'Request failed')
            setSubmitting(false)
            return
          }
          router.push('/appointments')
          router.refresh()
        } catch {
          setError('Request failed')
          setSubmitting(false)
        }
      }

      return (
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink">Customer</label>
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="mb-2 w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
            />
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
            >
              <option value="" disabled>
                Select a customer…
              </option>
              {filteredCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Doctor</label>
            <select
              required
              value={doctorUid}
              onChange={(e) => setDoctorUid(e.target.value)}
              className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
            >
              <option value="" disabled>
                Select a doctor…
              </option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Date &amp; time</label>
            <input
              required
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Duration (minutes)</label>
            <input
              required
              type="number"
              min={5}
              step={5}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Reason for visit (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
          >
            Book appointment
          </button>
        </form>
      )
    }
    ```

15. `src/app/(dashboard)/appointments/new/page.tsx` — Create:
    ```tsx
    import { redirect } from 'next/navigation'
    import { requireCapability, AuthError } from '@/lib/auth/server-guard'
    import { getAdminFirestore } from '@/lib/firebase/admin'
    import AppointmentForm from '@/components/appointments/AppointmentForm'

    export default async function NewAppointmentPage({
      searchParams,
    }: {
      searchParams: Promise<{ customerId?: string }>
    }) {
      const { customerId } = await searchParams

      try {
        await requireCapability('clinical.appointments.manage')
      } catch (err) {
        if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
        throw err
      }

      const db = getAdminFirestore()
      const [customersSnap, doctorsSnap] = await Promise.all([
        db.collection('customers').get(),
        db.collection('staff').where('role', '==', 'doctor').get(),
      ])

      const customers = customersSnap.docs.map((d) => {
        const data = d.data()
        return { id: d.id, name: data.name as string, phone: data.phone as string }
      })
      const doctors = doctorsSnap.docs.map((d) => {
        const data = d.data()
        return { id: d.id, name: data.name as string }
      })

      return (
        <div className="mx-auto mt-12 max-w-4xl space-y-6">
          <h1 className="font-display text-xl font-semibold text-ink">Book appointment</h1>
          <AppointmentForm customers={customers} doctors={doctors} defaultCustomerId={customerId} />
        </div>
      )
    }
    ```

16. `src/components/appointments/AppointmentsTable.tsx` — Create. `'use client'`:
    ```tsx
    'use client'
    import { useState } from 'react'
    import { useRouter } from 'next/navigation'
    import type { AppointmentRow } from '@/lib/clinical/getAppointments'

    export interface AppointmentsTableProps {
      appointments: AppointmentRow[]
    }

    export default function AppointmentsTable({ appointments }: AppointmentsTableProps) {
      const router = useRouter()
      const [cancelingId, setCancelingId] = useState<string | null>(null)
      const [cancelReason, setCancelReason] = useState('')
      const [error, setError] = useState<string | null>(null)
      const [submittingId, setSubmittingId] = useState<string | null>(null)

      async function updateStatus(id: string, status: 'completed' | 'cancelled' | 'no_show', cancellationReason?: string) {
        setError(null)
        setSubmittingId(id)
        try {
          const res = await fetch(`/api/appointments/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              status === 'cancelled' ? { status, cancellationReason: cancellationReason || null } : { status }
            ),
          })
          const body = await res.json()
          if (!res.ok) {
            setError(body.error ?? 'Request failed')
            setSubmittingId(null)
            return
          }
          setCancelingId(null)
          setCancelReason('')
          router.refresh()
        } catch {
          setError('Request failed')
          setSubmittingId(null)
        }
      }

      if (appointments.length === 0) {
        return <p className="text-sm text-slate">No appointments found.</p>
      }

      return (
        <div className="space-y-3">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="overflow-hidden rounded-md border border-mist">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Customer</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Duration</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {appointments.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                    <td className="px-3 py-2 text-ink">{new Date(row.scheduledAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-ink">{row.customerName}</td>
                    <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                    <td className="px-3 py-2 text-ink">{row.durationMinutes} min</td>
                    <td className="px-3 py-2 text-ink">{row.status}</td>
                    <td className="px-3 py-2 text-ink">
                      {row.status === 'scheduled' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={submittingId === row.id}
                            onClick={() => updateStatus(row.id, 'completed')}
                            className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist disabled:opacity-50"
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            disabled={submittingId === row.id}
                            onClick={() => updateStatus(row.id, 'no_show')}
                            className="rounded-md border border-mist px-2 py-1 text-xs text-ink transition-colors hover:bg-mist disabled:opacity-50"
                          >
                            No-show
                          </button>
                          {cancelingId === row.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                placeholder="Reason (optional)"
                                className="rounded-md border border-mist bg-paper px-2 py-1 text-xs text-ink placeholder:text-slate focus:border-marine"
                              />
                              <button
                                type="button"
                                disabled={submittingId === row.id}
                                onClick={() => updateStatus(row.id, 'cancelled', cancelReason)}
                                className="rounded-md border border-danger px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
                              >
                                Confirm cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCancelingId(row.id)}
                              className="rounded-md border border-danger px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }
    ```

17. `src/app/(dashboard)/appointments/page.tsx` — Create:
    ```tsx
    import { redirect } from 'next/navigation'
    import Link from 'next/link'
    import { requireCapability, AuthError } from '@/lib/auth/server-guard'
    import { getAdminFirestore } from '@/lib/firebase/admin'
    import { getAppointments } from '@/lib/clinical/getAppointments'
    import AppointmentsTable from '@/components/appointments/AppointmentsTable'

    export default async function AppointmentsPage({
      searchParams,
    }: {
      searchParams: Promise<{ doctorUid?: string }>
    }) {
      const { doctorUid } = await searchParams

      let user
      try {
        user = await requireCapability('clinical.appointments.manage')
      } catch (err) {
        if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
        throw err
      }

      const db = getAdminFirestore()
      const doctorsSnap = await db.collection('staff').where('role', '==', 'doctor').get()
      const doctors = doctorsSnap.docs.map((d) => {
        const data = d.data()
        return { id: d.id, name: data.name as string }
      })

      const appointments = await getAppointments({ doctorUid: doctorUid || undefined }, user)

      return (
        <div className="mx-auto mt-12 max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-semibold text-ink">Appointments</h1>
            <Link href="/appointments/new" className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity">
              Book appointment
            </Link>
          </div>

          <form method="GET" className="flex items-end gap-2">
            <div>
              <label className="block text-sm font-medium text-ink">Doctor</label>
              <select
                name="doctorUid"
                defaultValue={doctorUid ?? ''}
                className="rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
              >
                <option value="">All doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-mist px-3 py-2 text-sm text-ink transition-colors hover:bg-mist"
            >
              Filter
            </button>
          </form>

          <AppointmentsTable appointments={appointments} />
        </div>
      )
    }
    ```

18. `src/components/layout/Sidebar.tsx` — Modify:
    - Add a new icon alongside the other hand-authored line icons (after `ChartLineIcon`):
      ```tsx
      const StethoscopeIcon: IconComponent = ({ className }) => (
        <svg {...ICON_SVG_PROPS} className={className}>
          <path d="M6 4v6a4 4 0 008 0V4" />
          <path d="M10 14v2a4 4 0 004 4 4 4 0 004-4v-1" />
          <circle cx="18" cy="9" r="1.5" />
        </svg>
      )
      ```
    - Add one entry to `NAV_LINKS`, after the `Stock Report` entry:
      ```ts
      { href: '/appointments', label: 'Appointments', capability: 'clinical.appointments.manage', icon: StethoscopeIcon },
      ```
    Nothing else in this file changes.

## Task 7: Customer detail page — Upcoming appointments section

**Review tier: Sonnet**, but the diff review must explicitly confirm the "do not touch" list below — same standard as Phase 13's Task 4.

19. `src/app/(dashboard)/customers/[id]/page.tsx` — Modify:
    - Add import: `import { getAppointments } from '@/lib/clinical/getAppointments'`.
    - After the existing `const canCreateTreatment = hasCapability(user.role, 'clinical.record.create')` line, add:
      ```ts
      const canManageAppointments = hasCapability(user.role, 'clinical.appointments.manage')
      const upcomingAppointments = canManageAppointments
        ? await getAppointments({ customerId: id, upcomingOnly: true }, user)
        : []
      ```
    - After the existing `{canViewClinical && (<ClinicalSection ... />)}` block (the last thing in the returned JSX before its closing `</div>`), add a new sibling block — do not nest it inside the clinical section, do not touch the clinical section's own JSX:
      ```tsx
      {canManageAppointments && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium text-ink">Upcoming appointments</h2>
          {upcomingAppointments.length === 0 ? (
            <p className="text-sm text-slate">No upcoming appointments.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-mist">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Doctor</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {upcomingAppointments.map((row) => (
                    <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                      <td className="px-3 py-2 text-ink">{new Date(row.scheduledAt).toLocaleString()}</td>
                      <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                      <td className="px-3 py-2 text-ink">{row.reason ?? '—'}</td>
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

    **Do NOT change:** anything inside the Purchase History block's JSX or the `PurchaseRow`/sales-query logic, the `canManage`/Edit/Delete block, the key-value detail block (phone/email/address/notes), the Clinical record section's own JSX (`ClinicalSection` call and its props). The diff for this task must show only: one new import, two new `const` lines, and one new appended JSX block — nothing inside any pre-existing block touched.

## Execution

Seven tasks, in order (1 → 2 → 3 → 4 → 5 → 6 → 7 — each depends on the previous; Task 5 (Cloud Function) can run in parallel with Task 6/7 since neither touches the other's files, but keep it sequential unless you're confident in the parallelization). Given the stakes — a new capability grant, a new closed collection, a real Firestore transaction guarding a business-meaningful invariant (no double-booking), and a "do not touch" requirement on an already-twice-modified page — **Tasks 1, 3, and 4 get Opus review**; Tasks 2, 5, 6, 7 get Sonnet-tier review, matching this project's established practice (Opus for access-control/transaction-critical work, Sonnet for CRUD/UI). Final whole-branch review also on Opus, specifically re-checking:

- `clinical.appointments.manage`'s role list is exactly `CLINICAL_VIEW_ROLES` (same four roles as `clinical.record.view`), confirmed by direct comparison, not just visual similarity.
- Every one of the six roles *not* in that list (`branch_manager`, `cashier`, `hr_admin`, `finance_admin`, `it_admin`, and the absence of `general_manager` as a role at all) gets 403 on `POST`/`GET /api/appointments` and `PATCH /api/appointments/[id]`, verified by direct API call, not just by reading the permissions table.
- The overlap check correctly ignores `cancelled`/`completed`/`no_show` appointments and correctly excludes an appointment's own prior slot during reschedule.
- `appointments` has zero client-reachable paths in `firestore.rules`.
- Every code path that lists appointments (the schedule page, the customer detail page's new section, and the API route) goes through `getAppointments` and therefore writes exactly one `appointment_view` entry per call — no read path bypasses it.
- `customers/[id]/page.tsx`'s diff touches only what Task 7 describes — Purchase History and Clinical record sections byte-identical to their pre-Phase-14 state.
- `NotificationBell.tsx`'s `NOTIFICATION_LINKS` map compiles (TypeScript will already fail the build if it doesn't, but confirm the entry resolves to a sensible route).

**Live verification** (needs the user's explicit go-ahead before writing any real data to `erp-lfd`, per this project's standing test-data policy): using existing real accounts from Phases 8/13/13.1 where possible, book a real appointment for an existing customer against a real doctor account; confirm a second, overlapping booking against the same doctor is rejected with 409 and a non-overlapping one succeeds; confirm a `branch_manager`/`cashier`/`hr_admin`/`finance_admin`/`it_admin` account gets 403 on all three endpoints; confirm the doctor receives a real `notifications` entry (`appointment_scheduled`) after creation; confirm the customer detail page's "Upcoming appointments" section shows it for a `medical_secretary`/`doctor`/`admin` viewer and is absent for a `branch_manager`/`cashier` viewer; confirm `auditLogs` shows the expected `appointment_create`/`appointment_view` sequence with no duplicate or missing entries; cancel the test appointment with a reason and confirm `cancelledAt`/`cancelledBy`/`cancellationReason` are set correctly.

**Completion report** matching Phases 8/12/13's level of detail: commit hashes, file/line counts, explicit confirmation of every "do not touch" item, the capability-footprint comparison against `clinical.record.view`, a note on all five flagged decisions above and how they held up under review, and an explicit mention that TD-3 (customer deletion referential integrity) now also applies to `appointments` — flagged, not fixed, per the Known-issues policy.
