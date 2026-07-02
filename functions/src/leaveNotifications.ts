import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

// Duplicated from src/lib/auth/permissions.ts's APPROVER_ROLES minus
// 'branch_manager' — this is a separate deployable with its own tsconfig/
// build (functions/tsconfig.json deliberately does not reach into the root
// src/ tree), so it can't import that constant the way two files inside the
// same Next.js build can. Same situation firestore.rules is already in for
// the same reason (see its ADMIN_HR/ADMIN_IT "keep in sync" comments) —
// this is that exact, already-accepted pattern applied to a second
// cross-boundary case, not a new one. If APPROVER_ROLES ever changes in
// permissions.ts, update this list too.
const APPROVER_ROLES_BEYOND_BRANCH_MANAGER = ['hr_admin', 'admin', 'super_admin']

function formatDate(ts: FirebaseFirestore.Timestamp): string {
  return ts.toDate().toISOString().slice(0, 10)
}

export const onLeaveRequestSubmitted = onDocumentCreated(
  { document: 'leaveRequests/{requestId}', database: 'default' },
  async (event) => {
    const request = event.data?.data()
    if (!request) return

    const { staffId, branchId, type, startDate, endDate } = request as {
      staffId: string
      branchId: string
      type: string
      startDate: FirebaseFirestore.Timestamp
      endDate: FirebaseFirestore.Timestamp
    }

    const db = getFunctionsFirestore()
    const requesterSnap = await db.collection('staff').doc(staffId).get()
    const requesterName = requesterSnap.exists ? (requesterSnap.data()!.name as string) : staffId

    const [branchManagersSnap, otherApproversSnap] = await Promise.all([
      db.collection('staff').where('role', '==', 'branch_manager').where('branchId', '==', branchId).get(),
      db.collection('staff').where('role', 'in', APPROVER_ROLES_BEYOND_BRANCH_MANAGER).get(),
    ])
    const recipientUids = new Set<string>([
      ...branchManagersSnap.docs.map((d) => d.id),
      ...otherApproversSnap.docs.map((d) => d.id),
    ])
    // A requester who happens to also be an approver (e.g. a branch_manager
    // requesting their own leave) shouldn't be notified about their own
    // submission.
    recipientUids.delete(staffId)
    // Empty recipient set (e.g. a branch with no branch_manager and,
    // somehow, no org-wide approver either) — nothing to notify, done;
    // must not error or commit a no-op batch.
    if (recipientUids.size === 0) return

    const requestId = event.params.requestId
    const batch = db.batch()
    for (const recipientUid of recipientUids) {
      const notifRef = db.collection('notifications').doc(`leave_request_submitted_${requestId}_${recipientUid}`)
      batch.create(notifRef, {
        recipientUid,
        type: 'leave_request_submitted',
        title: 'New leave request',
        body: `${requesterName} requested ${type} leave from ${formatDate(startDate)} to ${formatDate(endDate)}.`,
        relatedId: requestId,
        read: false,
        createdAt: new Date(),
      })
    }
    try {
      await batch.commit()
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)

export const onLeaveRequestReviewed = onDocumentUpdated(
  { document: 'leaveRequests/{requestId}', database: 'default' },
  async (event) => {
    const before = event.data?.before?.data()
    const after = event.data?.after?.data()
    if (!before || !after) return

    const statusJustDecided = before.status === 'pending' && (after.status === 'approved' || after.status === 'rejected')
    if (!statusJustDecided) return

    const { staffId, type, startDate, endDate, status, reviewNote } = after as {
      staffId: string
      type: string
      startDate: FirebaseFirestore.Timestamp
      endDate: FirebaseFirestore.Timestamp
      status: 'approved' | 'rejected'
      reviewNote: string | null
    }

    const db = getFunctionsFirestore()
    const requestId = event.params.requestId
    const notifRef = db.collection('notifications').doc(`leave_request_reviewed_${requestId}_${staffId}`)
    try {
      await notifRef.create({
        recipientUid: staffId,
        type: 'leave_request_reviewed',
        title: `Leave request ${status}`,
        body: `Your ${type} leave request (${formatDate(startDate)} – ${formatDate(endDate)}) was ${status}.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
        relatedId: requestId,
        read: false,
        createdAt: new Date(),
      })
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
