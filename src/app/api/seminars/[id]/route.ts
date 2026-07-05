import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { SeminarFormat } from '@/lib/types/seminar'

const FORMATS: SeminarFormat[] = ['physical', 'online', 'hybrid']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const EDITABLE_FIELDS = ['title', 'description', 'scheduledAt', 'format', 'branchId'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('seminars.manage')
    const db = getAdminFirestore()
    const docRef = db.collection('seminars').doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    const body = await request.json()

    if ('title' in body && !isNonEmptyString(body.title)) {
      return NextResponse.json({ error: 'title must be a non-empty string' }, { status: 400 })
    }
    if ('scheduledAt' in body) {
      if (!isNonEmptyString(body.scheduledAt) || Number.isNaN(new Date(body.scheduledAt).getTime())) {
        return NextResponse.json({ error: 'scheduledAt must be a valid date' }, { status: 400 })
      }
    }
    if ('format' in body && (!isNonEmptyString(body.format) || !FORMATS.includes(body.format as SeminarFormat))) {
      return NextResponse.json({ error: 'format must be physical, online, or hybrid' }, { status: 400 })
    }
    if ('description' in body && body.description !== null && !isNonEmptyString(body.description)) {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 })
    }

    const nextFormat = ('format' in body ? body.format : existing.format) as SeminarFormat

    if ('branchId' in body || 'format' in body) {
      if (nextFormat === 'online') {
        if ('branchId' in body && body.branchId !== null && body.branchId !== '') {
          return NextResponse.json({ error: 'branchId must not be set for an online seminar' }, { status: 400 })
        }
      } else {
        const candidateBranchId = 'branchId' in body ? body.branchId : existing.branchId
        if (!isNonEmptyString(candidateBranchId)) {
          return NextResponse.json({ error: 'branchId is required for a physical or hybrid seminar' }, { status: 400 })
        }
        const branchSnap = await db.collection('branches').doc(candidateBranchId.trim()).get()
        if (!branchSnap.exists) {
          return NextResponse.json({ error: 'branchId does not reference an existing branch' }, { status: 400 })
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (!(field in body)) continue
      if (field === 'title') {
        updates.title = body.title.trim()
      } else if (field === 'scheduledAt') {
        updates.scheduledAt = new Date(body.scheduledAt)
      } else if (field === 'format') {
        updates.format = body.format
      } else if (field === 'description') {
        updates.description = isNonEmptyString(body.description) ? body.description.trim() : null
      } else if (field === 'branchId') {
        updates.branchId = nextFormat === 'online' ? null : (body.branchId as string).trim()
      }
    }
    if (nextFormat === 'online') updates.branchId = null

    await docRef.update(updates)

    await writeAuditLog({
      action: 'seminar_edit',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
