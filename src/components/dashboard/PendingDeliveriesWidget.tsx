import type { PendingDeliveriesSummary } from '@/lib/dashboard/pendingDeliveriesSummary'

export default function PendingDeliveriesWidget({ summary }: { summary: PendingDeliveriesSummary }) {
  return (
    <div className="space-y-3">
      {summary.totalCount === 0 ? (
        <p className="text-sm text-slate">No pending deliveries.</p>
      ) : (
        <>
          <p className="text-sm text-slate">
            <span className="font-mono text-base font-medium text-warning">{summary.totalCount}</span>{' '}
            {summary.totalCount === 1 ? 'delivery' : 'deliveries'} owed to customers
          </p>
          <ul className="divide-y divide-mist">
            {summary.rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {row.productName}
                  <span className="ml-2 text-xs text-slate">{row.branchName}</span>
                </span>
                <span className="font-mono text-ink">{row.quantityOwed}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
