import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { LeaveRequest } from '@/lib/types/leave-request'

export interface PendingLeaveApprovalRow {
  id: string
  staffName: string
  type: string
  startDate: string
  endDate: string
}

// Replicates leave/review/page.tsx's own query exactly (role === 'branch_manager'
// scoping, not isBranchLocked — matching what that page already does) rather
// than modifying it — that page's query only ever existed inline, with no
// shared function to import, so this is the reuse-without-reimplementation
// path for this one widget. leave/review/page.tsx itself is untouched.
export async function getPendingLeaveApprovals(viewer: SessionUser): Promise<PendingLeaveApprovalRow[]> {
  if (!hasCapability(viewer.role, 'hr.leave.approve')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const query: FirebaseFirestore.Query =
    viewer.role === 'branch_manager'
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
