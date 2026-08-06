import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasEffectiveCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { LeaveRequest } from '@/lib/types/leave-request'

export interface PendingLeaveApprovalRow {
  id: string
  staffName: string
  type: string
  startDate: string
  endDate: string
}

// Must match leave/review/page.tsx's scoping exactly (same hr.leave.approve
// capability, same isBranchLocked predicate) — see Phase 42's H-2 fix.
export async function getPendingLeaveApprovals(viewer: SessionUser): Promise<PendingLeaveApprovalRow[]> {
  if (!hasEffectiveCapability(viewer, 'hr.leave.approve')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const query: FirebaseFirestore.Query =
    isBranchLocked(viewer.role)
      ? db.collection('leaveRequests').where('branchId', '==', viewer.branchId).where('status', '==', 'pending')
      : db.collection('leaveRequests').where('status', '==', 'pending')
  const snap = await query.orderBy('createdAt', 'desc').get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as LeaveRequest }))
  const uniqueStaffIds = Array.from(new Set(docs.map((d) => d.data.staffId)))
  const staffDocs = await Promise.all(uniqueStaffIds.map((id) => db.collection('staff').doc(id).get()))
  const staffNames: Record<string, string> = {}
  uniqueStaffIds.forEach((id, i) => {
    staffNames[id] = (staffDocs[i].data()?.name as string | undefined) ?? id
  })

  return docs.map(({ id, data }) => ({
    id,
    staffName: staffNames[data.staffId] ?? data.staffId,
    type: data.type,
    startDate: data.startDate.toDate().toISOString().slice(0, 10),
    endDate: data.endDate.toDate().toISOString().slice(0, 10),
  }))
}
