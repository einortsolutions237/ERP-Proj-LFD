import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildSalesReport, ReportValidationError } from '@/lib/reports/sales'
import { toCsv } from '@/lib/csv'
import DownloadCsvButton from '@/components/reports/DownloadCsvButton'

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>
}) {
  const { startDate: startParam, endDate: endParam } = await searchParams

  let user
  try {
    user = await requireCapability('reports.sales.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // buildSalesReport throws ReportValidationError for a bad date range (e.g.
  // end before start, picked via the form below). Caught here rather than
  // letting it surface as an unhandled 500 — the form re-renders with the
  // submitted (invalid) values so the user can correct them.
  let report: Awaited<ReturnType<typeof buildSalesReport>> | null = null
  let rangeError: string | null = null
  try {
    report = await buildSalesReport(user, startParam ?? null, endParam ?? null)
  } catch (err) {
    if (err instanceof ReportValidationError) {
      rangeError = err.message
    } else {
      throw err
    }
  }

  // Date inputs default to the resolved range's actual values so re-rendering
  // after a query shows what's currently applied, not blank inputs. On a
  // validation error there's no resolved range, so fall back to whatever the
  // user submitted.
  const startValue = report ? report.range.start.slice(0, 10) : startParam ?? ''
  const endValue = report ? report.range.end.slice(0, 10) : endParam ?? ''

  // CSV shape: one row per top-seller (product/service, quantity, revenue).
  // This is the most granular per-row breakdown the report exposes and the
  // brief's first suggested example; byBranch/byPaymentMethod are already
  // small enough to read directly off the on-screen tables.
  const csv = report
    ? toCsv(
        ['Type', 'Name', 'Quantity', 'Revenue'],
        report.topSellers.map((item) => [item.type, item.name, item.quantity, item.revenue.toFixed(2)])
      )
    : ''

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="text-xl font-semibold">Sales report</h1>

      <form method="GET" className="flex items-end gap-2">
        <div>
          <label className="block text-sm font-medium">Start date</label>
          <input
            type="date"
            name="startDate"
            defaultValue={startValue}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">End date</label>
          <input
            type="date"
            name="endDate"
            defaultValue={endValue}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="bg-black text-white rounded px-3 py-2 text-sm">
          View
        </button>
      </form>

      {rangeError && <p className="text-sm text-red-600">{rangeError}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Revenue</div>
              <div className="text-lg font-semibold">{report.revenueTotal.toFixed(2)}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Sales</div>
              <div className="text-lg font-semibold">{report.nonVoidedCount}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Average sale</div>
              <div className="text-lg font-semibold">{report.averageSaleValue.toFixed(2)}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Voided count</div>
              <div className="text-lg font-semibold">{report.voidedCount}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Voided total</div>
              <div className="text-lg font-semibold">{report.voidedTotal.toFixed(2)}</div>
            </div>
          </div>

          <DownloadCsvButton filename="sales-report.csv" csv={csv} />

          <section>
            <h2 className="text-lg font-semibold mb-2">By branch</h2>
            {report.byBranch.length === 0 ? (
              <p className="text-sm text-gray-500">No sales in this range.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Branch</th>
                    <th className="py-2 pr-4">Revenue</th>
                    <th className="py-2 pr-4">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byBranch.map((row) => (
                    <tr key={row.branchId} className="border-b">
                      <td className="py-2 pr-4">{row.branchName}</td>
                      <td className="py-2 pr-4">{row.revenue.toFixed(2)}</td>
                      <td className="py-2 pr-4">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">By payment method</h2>
            {report.byPaymentMethod.length === 0 ? (
              <p className="text-sm text-gray-500">No payments in this range.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2 pr-4">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byPaymentMethod.map((row) => (
                    <tr key={row.method} className="border-b">
                      <td className="py-2 pr-4">{row.method}</td>
                      <td className="py-2 pr-4">{row.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Top sellers</h2>
            {report.topSellers.length === 0 ? (
              <p className="text-sm text-gray-500">No items sold in this range.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Quantity</th>
                    <th className="py-2 pr-4">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topSellers.map((row) => (
                    <tr key={`${row.type}:${row.itemId}`} className="border-b">
                      <td className="py-2 pr-4">{row.type}</td>
                      <td className="py-2 pr-4">{row.name}</td>
                      <td className="py-2 pr-4">{row.quantity}</td>
                      <td className="py-2 pr-4">{row.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}
