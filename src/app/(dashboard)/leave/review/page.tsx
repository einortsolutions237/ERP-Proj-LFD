import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import LeaveReviewButtons from '@/components/leave/LeaveReviewButtons'
import type { LeaveRequest } from '@/lib/types/leave-request'

// Rows are built field-by-field from the raw doc (never spread) so a
// Firestore Timestamp can never leak into this page's render — same
// discipline as customers/[id]/page.tsx's PurchaseRow.
interface ReviewRow {
  id: string
  staffName: string
  type: string
  startDate: string
  endDate: string
  reason: string | null
}

export default async function ReviewLeavePage() {
  let user
  try {
    user = await requireCapability('hr.leave.approve')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()

  let query: FirebaseFirestore.Query =
    user.role === 'branch_manager'
      ? db.collection('leaveRequests').where('branchId', '==', user.branchId).where('status', '==', 'pending')
      : db.collection('leaveRequests').where('status', '==', 'pending')
  const snap = await query.orderBy('createdAt', 'desc').get()

  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as LeaveRequest }))

  const uniqueStaffIds = Array.from(new Set(docs.map((d) => d.data.staffId)))
  const staffDocs = await Promise.all(uniqueStaffIds.map((id) => db.collection('staff').doc(id).get()))
  const staffNames: Record<string, string> = {}
  uniqueStaffIds.forEach((id, i) => {
    staffNames[id] = staffDocs[i].data()?.name ?? id
  })

  const requests: ReviewRow[] = docs.map(({ id, data }) => ({
    id,
    staffName: staffNames[data.staffId] ?? data.staffId,
    type: data.type,
    startDate: data.startDate.toDate().toISOString().slice(0, 10),
    endDate: data.endDate.toDate().toISOString().slice(0, 10),
    reason: data.reason,
  }))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Review Leave</h1>

      {requests.length === 0 ? (
        <p className="text-sm text-slate">No pending leave requests.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Staff</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Start</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">End</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reason</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {requests.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{row.staffName}</td>
                  <td className="px-3 py-2 text-ink">{row.type}</td>
                  <td className="px-3 py-2 text-ink">{row.startDate}</td>
                  <td className="px-3 py-2 text-ink">{row.endDate}</td>
                  <td className="px-3 py-2 text-ink">{row.reason ?? '—'}</td>
                  <td className="px-3 py-2">
                    <LeaveReviewButtons requestId={row.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
