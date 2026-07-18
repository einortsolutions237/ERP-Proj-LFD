import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildInventoryReport } from '@/lib/reports/inventory'
import { toCsv } from '@/lib/csv'
import DownloadCsvButton from '@/components/reports/DownloadCsvButton'

export default async function InventoryReportPage() {
  let user
  try {
    user = await requireCapability('reports.inventory.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const report = await buildInventoryReport(user)

  // CSV shape: one row per stock row (product x branch), matching the
  // on-screen table exactly — the report's most granular, unambiguous table.
  const csv = toCsv(
    ['Product', 'Branch', 'Quantity', 'Reorder threshold', 'Low stock', 'Value'],
    report.rows.map((row) => [
      row.productName,
      row.branchName,
      row.quantity,
      row.reorderThreshold,
      row.lowStock ? 'yes' : 'no',
      row.value.toFixed(2),
    ])
  )

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Inventory report</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
          <div className="text-xs text-slate">Total value</div>
          <div className="font-mono text-lg font-semibold text-ink">{report.totalValue.toFixed(2)}</div>
        </div>
      </div>

      <DownloadCsvButton filename="inventory-report.csv" csv={csv} />

      <section>
        <h2 className="text-lg font-medium text-ink mb-2">By branch</h2>
        {report.byBranch.length === 0 ? (
          <p className="text-sm text-slate">No stock recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Total value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {report.byBranch.map((row) => (
                  <tr key={row.branchId} className="hover:bg-mist/40 transition-colors duration-200">
                    <td className="px-3 py-2 text-ink">{row.branchName}</td>
                    <td className="px-3 py-2 font-mono text-right text-ink">{row.totalValue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium text-ink mb-2">Stock levels</h2>
        {report.rows.length === 0 ? (
          <p className="text-sm text-slate">No stock recorded.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Product</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Quantity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Reorder threshold</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {report.rows.map((row) => (
                  <tr
                    key={`${row.productId}:${row.branchId}`}
                    className={`hover:bg-mist/40 transition-colors duration-200 ${row.lowStock ? 'bg-danger/5' : ''}`}
                  >
                    <td className="px-3 py-2 text-ink">{row.productName}</td>
                    <td className="px-3 py-2 text-ink">{row.branchName}</td>
                    <td className={`px-3 py-2 font-mono text-right ${row.lowStock ? 'text-danger' : 'text-ink'}`}>
                      {row.quantity}
                    </td>
                    <td className="px-3 py-2 font-mono text-right text-ink">{row.reorderThreshold}</td>
                    <td className="px-3 py-2 font-mono text-right text-ink">{row.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
