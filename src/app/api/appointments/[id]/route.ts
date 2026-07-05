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
          const freshSnap = await tx.get(apptRef)
          if (!freshSnap.exists || freshSnap.data()!.status !== 'scheduled') {
            throw new AuthError('Only a scheduled appointment can be updated', 409)
          }
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
