import type { LowStockSummary } from '@/lib/dashboard/lowStockSummary'
import StatSummary from '@/components/ui/StatSummary'

export default function LowStockWidget({ summary }: { summary: LowStockSummary }) {
  return (
    <div className="space-y-3">
      {summary.totalCount === 0 ? (
        <p className="text-sm text-slate">No products are currently low on stock.</p>
      ) : (
        <>
          <StatSummary
            count={summary.totalCount}
            tone="danger"
            label={`product${summary.totalCount === 1 ? '' : 's'} at or below reorder threshold`}
          />
          <ul className="divide-y divide-mist">
            {summary.rows.map((row) => (
              <li key={`${row.branchId}_${row.productId}`} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {row.productName}
                  <span className="ml-2 text-xs text-slate">{row.branchName}</span>
                </span>
                <span className="font-mono text-danger">
                  {row.quantity} / {row.reorderThreshold}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
