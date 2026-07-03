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
      row.value,
    ])
  )

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="text-xl font-semibold">Inventory report</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="border rounded p-3">
          <div className="text-xs text-gray-500">Total value</div>
          <div className="text-lg font-semibold">{report.totalValue.toFixed(2)}</div>
        </div>
      </div>

      <DownloadCsvButton filename="inventory-report.csv" csv={csv} />

      <section>
        <h2 className="text-lg font-semibold mb-2">By branch</h2>
        {report.byBranch.length === 0 ? (
          <p className="text-sm text-gray-500">No stock recorded.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Branch</th>
                <th className="py-2 pr-4">Total value</th>
              </tr>
            </thead>
            <tbody>
              {report.byBranch.map((row) => (
                <tr key={row.branchId} className="border-b">
                  <td className="py-2 pr-4">{row.branchName}</td>
                  <td className="py-2 pr-4">{row.totalValue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Stock levels</h2>
        {report.rows.length === 0 ? (
          <p className="text-sm text-gray-500">No stock recorded.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Branch</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Reorder threshold</th>
                <th className="py-2 pr-4">Value</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr
                  key={`${row.productId}:${row.branchId}`}
                  className={`border-b ${row.lowStock ? 'bg-red-50 text-red-700' : ''}`}
                >
                  <td className="py-2 pr-4">{row.productName}</td>
                  <td className="py-2 pr-4">{row.branchName}</td>
                  <td className="py-2 pr-4">{row.quantity}</td>
                  <td className="py-2 pr-4">{row.reorderThreshold}</td>
                  <td className="py-2 pr-4">{row.value.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
