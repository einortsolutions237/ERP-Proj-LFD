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
      <h1 className="text-xl font-semibold">My Leave</h1>

      <LeaveRequestForm />

      <div className="space-y-3">
        <h2 className="text-lg font-medium">My requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-500">No leave requests yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Start</th>
                <th className="py-2 pr-4">End</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Review note</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-4">{row.type}</td>
                  <td className="py-2 pr-4">{row.startDate}</td>
                  <td className="py-2 pr-4">{row.endDate}</td>
                  <td className="py-2 pr-4">{row.reason ?? '—'}</td>
                  <td className="py-2 pr-4">{row.status}</td>
                  <td className="py-2 pr-4">{row.reviewNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
