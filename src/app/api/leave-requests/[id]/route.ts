import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import type { LeaveRequest, LeaveStatus } from '@/lib/types/leave-request'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await requireCapability('hr.leave.approve')
    const body = await request.json()

    if (body.status !== 'approved' && body.status !== 'rejected') {
      return NextResponse.json({ error: "status must be 'approved' or 'rejected'" }, { status: 400 })
    }
    const status = body.status as LeaveStatus

    if ('reviewNote' in body && body.reviewNote !== null && !isNonEmptyString(body.reviewNote)) {
      return NextResponse.json({ error: 'reviewNote must be a non-empty string or null' }, { status: 400 })
    }
    const reviewNote = isNonEmptyString(body.reviewNote) ? body.reviewNote.trim() : null

    const db = getAdminFirestore()
    const docRef = db.collection('leaveRequests').doc(id)

    let existing: LeaveRequest

    try {
      existing = await db.runTransaction(async (tx) => {
        // ---- READS (must all happen before any writes) ----
        const snap = await tx.get(docRef)

        if (!snap.exists) {
          throw new AuthError('Leave request not found', 404)
        }
        const current = snap.data() as LeaveRequest

        if (current.status !== 'pending') {
          throw new AuthError('This leave request has already been reviewed', 409)
        }

        // Self-approval prevention — holds for EVERY role, including super_admin.
        // This check has no role-based exception anywhere. Do not add one.
        if (current.staffId === user.uid) {
          throw new AuthError('You cannot review your own leave request', 403)
        }

        // Branch-ownership guard — a branch_manager cannot act on another
        // branch's request even via a direct document ID, not just be kept
        // from seeing it in a list. Direct generalization of the
        // pos.sale.void guard.
        if (user.role === 'branch_manager' && current.branchId !== user.branchId) {
          throw new AuthError('Can only review leave requests for your own branch', 403)
        }

        // Overlap check — only relevant when approving. Query every OTHER
        // approved request for the same employee and reject if any date
        // range overlaps the request being approved.
        if (status === 'approved') {
          const otherApprovedSnap = await tx.get(
            db.collection('leaveRequests').where('staffId', '==', current.staffId).where('status', '==', 'approved')
          )
          const newStart = (current.startDate as FirebaseFirestore.Timestamp).toDate()
          const newEnd = (current.endDate as FirebaseFirestore.Timestamp).toDate()
          for (const otherDoc of otherApprovedSnap.docs) {
            if (otherDoc.id === id) continue // self-exclude — same idiom as the customer-phone edit's self-exclusion check
            const other = otherDoc.data()
            const otherStart = (other.startDate as FirebaseFirestore.Timestamp).toDate()
            const otherEnd = (other.endDate as FirebaseFirestore.Timestamp).toDate()
            if (newStart <= otherEnd && newEnd >= otherStart) {
              throw new AuthError('Overlaps an already-approved leave request for this employee', 409)
            }
          }
        }

        // ---- WRITES ----
        tx.update(docRef, {
          status,
          reviewedBy: user.uid,
          reviewedAt: new Date(),
          reviewNote,
        })

        return current
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: status === 'approved' ? 'leave_request_approve' : 'leave_request_reject',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: id,
      branchId: existing.branchId,
      details: { reviewNote },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
