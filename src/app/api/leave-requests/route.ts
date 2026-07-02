import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { LeaveType } from '@/lib/types/leave-request'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'unpaid', 'other']

export async function POST(request: Request) {
  try {
    const user = await requireCapability('hr.leave.request')
    const body = await request.json()

    if (!LEAVE_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Invalid leave type' }, { status: 400 })
    }

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'startDate and endDate must be valid dates' }, { status: 400 })
    }
    if (endDate < startDate) {
      return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 })
    }

    if ('reason' in body && body.reason !== null && !isNonEmptyString(body.reason)) {
      return NextResponse.json({ error: 'reason must be a non-empty string or null' }, { status: 400 })
    }

    const db = getAdminFirestore()

    const newDocRef = await db.collection('leaveRequests').add({
      staffId: user.uid,
      branchId: user.branchId,
      type: body.type,
      startDate,
      endDate,
      reason: isNonEmptyString(body.reason) ? body.reason.trim() : null,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date(),
    })

    await writeAuditLog({
      action: 'leave_request_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: newDocRef.id,
      branchId: user.branchId,
      details: { type: body.type, startDate: body.startDate, endDate: body.endDate },
    })

    return NextResponse.json({ id: newDocRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
