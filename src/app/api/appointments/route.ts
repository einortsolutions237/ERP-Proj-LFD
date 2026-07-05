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
