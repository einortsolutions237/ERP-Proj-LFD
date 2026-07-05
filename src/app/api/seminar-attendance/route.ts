import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { getSeminarAttendance } from '@/lib/clinical/getSeminarAttendance'
import type { AttendanceMethod } from '@/lib/types/seminarAttendance'

const METHODS: AttendanceMethod[] = ['physical', 'online']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET(request: Request) {
  try {
    const user = await requireCapability('seminars.attendance.view')
    const { searchParams } = new URL(request.url)
    const seminarId = searchParams.get('seminarId')
    const customerId = searchParams.get('customerId')
    const rows = await getSeminarAttendance(
      { seminarId: seminarId ?? undefined, customerId: customerId ?? undefined },
      user
    )
    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('seminars.attendance.record')
    const body = await request.json()

    if (!isNonEmptyString(body.seminarId)) {
      return NextResponse.json({ error: 'seminarId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.method) || !METHODS.includes(body.method as AttendanceMethod)) {
      return NextResponse.json({ error: 'method must be physical or online' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const seminarId = body.seminarId.trim()
    const customerId = body.customerId.trim()

    const seminarSnap = await db.collection('seminars').doc(seminarId).get()
    if (!seminarSnap.exists) {
      return NextResponse.json({ error: 'seminarId does not reference an existing seminar' }, { status: 400 })
    }
    const customerSnap = await db.collection('customers').doc(customerId).get()
    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
    }

    const docRef = await db.collection('seminarAttendance').add({
      seminarId,
      customerId,
      method: body.method as AttendanceMethod,
      recordedBy: user.uid,
      recordedAt: new Date(),
    })

    await writeAuditLog({
      action: 'seminar_attendance_record',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: customerId,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
