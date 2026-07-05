import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, requireAnyCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { SeminarFormat } from '@/lib/types/seminar'

const FORMATS: SeminarFormat[] = ['physical', 'online', 'hybrid']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// List is not audit-logged — seminar title/date/format is event logistics,
// not clinical/PII data, unlike the attendance records it hosts (see
// getSeminarAttendance). Any of the three seminars capabilities can browse
// the list; only seminars.manage can create.
export async function GET() {
  try {
    await requireAnyCapability(['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'])
    const snap = await getAdminFirestore().collection('seminars').orderBy('scheduledAt', 'desc').get()
    const rows = snap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        title: data.title as string,
        description: (data.description as string | null) ?? null,
        scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
        format: data.format as SeminarFormat,
        branchId: (data.branchId as string | null) ?? null,
      }
    })
    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('seminars.manage')
    const body = await request.json()

    if (!isNonEmptyString(body.title)) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.scheduledAt)) {
      return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })
    }
    const scheduledAt = new Date(body.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 })
    }
    if (!isNonEmptyString(body.format) || !FORMATS.includes(body.format as SeminarFormat)) {
      return NextResponse.json({ error: 'format must be physical, online, or hybrid' }, { status: 400 })
    }
    const format = body.format as SeminarFormat

    let description: string | null = null
    if ('description' in body && body.description !== undefined && body.description !== null && body.description !== '') {
      if (!isNonEmptyString(body.description)) {
        return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 })
      }
      description = body.description.trim()
    }

    const db = getAdminFirestore()
    let branchId: string | null = null
    if (format === 'online') {
      if ('branchId' in body && body.branchId !== undefined && body.branchId !== null && body.branchId !== '') {
        return NextResponse.json({ error: 'branchId must not be provided for an online seminar' }, { status: 400 })
      }
    } else {
      if (!isNonEmptyString(body.branchId)) {
        return NextResponse.json({ error: 'branchId is required for a physical or hybrid seminar' }, { status: 400 })
      }
      const branchSnap = await db.collection('branches').doc(body.branchId.trim()).get()
      if (!branchSnap.exists) {
        return NextResponse.json({ error: 'branchId does not reference an existing branch' }, { status: 400 })
      }
      branchId = body.branchId.trim()
    }

    const seminarData = {
      title: body.title.trim(),
      description,
      scheduledAt,
      format,
      branchId,
      createdBy: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await db.collection('seminars').add(seminarData)

    await writeAuditLog({
      action: 'seminar_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
