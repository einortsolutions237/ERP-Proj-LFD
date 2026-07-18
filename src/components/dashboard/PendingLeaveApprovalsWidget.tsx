import type { PendingLeaveApprovalRow } from '@/lib/dashboard/pendingLeaveApprovals'

export default function PendingLeaveApprovalsWidget({ requests }: { requests: PendingLeaveApprovalRow[] }) {
  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <p className="text-sm text-slate">No pending leave requests.</p>
      ) : (
        <>
          <p className="text-sm text-slate">
            <span className="font-mono text-base font-medium text-ink">{requests.length}</span>{' '}
            pending leave {requests.length === 1 ? 'request' : 'requests'}
          </p>
          <ul className="divide-y divide-mist">
            {requests.slice(0, 5).map((req) => (
              <li key={req.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {req.staffName}
                  <span className="ml-2 text-xs text-slate">{req.type}</span>
                </span>
                <span className="font-mono text-xs text-slate">
                  {req.startDate} – {req.endDate}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
