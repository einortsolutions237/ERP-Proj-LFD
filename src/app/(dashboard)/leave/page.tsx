import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import LeaveRequestForm from '@/components/leave/LeaveRequestForm'
import type { LeaveRequest } from '@/lib/types/leave-request'

// Rows are built field-by-field from the raw doc (never spread) so a
// Firestore Timestamp can never leak into this page's render — same
// discipline as customers/[id]/page.tsx's PurchaseRow.
interface MyLeaveRow {
  id: string
  type: string
  startDate: string
  endDate: string
  reason: string | null
  status: string
  reviewNote: string | null
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-danger/10 text-danger',
}

export default async function MyLeavePage() {
  let user
  try {
    user = await requireCapability('hr.leave.request')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore()
    .collection('leaveRequests')
    .where('staffId', '==', user.uid)
    .orderBy('createdAt', 'desc')
    .get()

  const requests: MyLeaveRow[] = snap.docs.map((d) => {
    const data = d.data() as LeaveRequest
    return {
      id: d.id,
      type: data.type,
      startDate: data.startDate.toDate().toISOString().slice(0, 10),
      endDate: data.endDate.toDate().toISOString().slice(0, 10),
      reason: data.reason,
      status: data.status,
      reviewNote: data.reviewNote,
    }
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">My Leave</h1>

      <LeaveRequestForm />

      <div className="space-y-3">
        <h2 className="text-lg font-medium text-ink">My requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-slate">No leave requests yet.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Start</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">End</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reason</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Review note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {requests.map((row) => (
                  <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                    <td className="px-3 py-2 text-ink">{row.type}</td>
                    <td className="px-3 py-2 text-ink">{row.startDate}</td>
                    <td className="px-3 py-2 text-ink">{row.endDate}</td>
                    <td className="px-3 py-2 text-ink">{row.reason ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate/10 text-slate'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink">{row.reviewNote ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
