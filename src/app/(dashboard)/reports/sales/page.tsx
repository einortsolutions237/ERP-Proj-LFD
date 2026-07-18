import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildSalesReport, ReportValidationError } from '@/lib/reports/sales'
import { toCsv } from '@/lib/csv'
import DownloadCsvButton from '@/components/reports/DownloadCsvButton'

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; sortBy?: string }>
}) {
  const { startDate: startParam, endDate: endParam, sortBy: sortByParam } = await searchParams

  // Sorting top-sellers is a display concern, not an aggregation concern —
  // buildSalesReport always returns topSellers sorted by revenue descending;
  // resolve the requested sort here and apply it to a copy before rendering.
  const sortBy: 'revenue' | 'quantity' = sortByParam === 'quantity' ? 'quantity' : 'revenue'

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

  // Copy before sorting — buildSalesReport's own topSellers array (sorted by
  // revenue) is never mutated. Rendered table and CSV both use this sorted
  // copy so their row order always matches.
  const sortedTopSellers = report ? [...report.topSellers].sort((a, b) => b[sortBy] - a[sortBy]) : []

  // Preserve the current date range when toggling sort order, so switching
  // sort doesn't drop the applied filter.
  const sortLinkParams = (nextSortBy: 'revenue' | 'quantity') => {
    const params = new URLSearchParams()
    if (startParam) params.set('startDate', startParam)
    if (endParam) params.set('endDate', endParam)
    params.set('sortBy', nextSortBy)
    return `?${params.toString()}`
  }

  // CSV shape: one row per top-seller (product/service, quantity, revenue).
  // This is the most granular per-row breakdown the report exposes and the
  // brief's first suggested example; byBranch/byPaymentMethod are already
  // small enough to read directly off the on-screen tables.
  const csv = report
    ? toCsv(
        ['Type', 'Name', 'Quantity', 'Revenue'],
        sortedTopSellers.map((item) => [item.type, item.name, item.quantity, item.revenue.toFixed(2)])
      )
    : ''

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Sales report</h1>

      <form method="GET" className="flex items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-ink">Start date</label>
          <input
            type="date"
            name="startDate"
            defaultValue={startValue}
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">End date</label>
          <input
            type="date"
            name="endDate"
            defaultValue={endValue}
            className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
          />
        </div>
        <button type="submit" className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-opacity duration-200 disabled:opacity-50">
          View
        </button>
      </form>

      {rangeError && <p className="text-sm text-danger">{rangeError}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Revenue</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.revenueTotal.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Sales</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.nonVoidedCount}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Average sale</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.averageSaleValue.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Voided count</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.voidedCount}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Voided total</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.voidedTotal.toFixed(2)}</div>
            </div>
          </div>

          <DownloadCsvButton filename="sales-report.csv" csv={csv} />

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">By branch</h2>
            {report.byBranch.length === 0 ? (
              <p className="text-sm text-slate">No sales in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Revenue</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {report.byBranch.map((row) => (
                      <tr key={row.branchId} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.branchName}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.revenue.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">By payment method</h2>
            {report.byPaymentMethod.length === 0 ? (
              <p className="text-sm text-slate">No payments in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Method</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {report.byPaymentMethod.map((row) => (
                      <tr key={row.method} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.method}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">Top sellers</h2>
            <p className="text-sm text-slate mb-2">
              Sort by:{' '}
              {sortBy === 'revenue' ? (
                <span className="font-medium text-ink">Revenue</span>
              ) : (
                <Link href={sortLinkParams('revenue')} className="text-marine underline-offset-2 hover:underline">
                  Revenue
                </Link>
              )}
              {' | '}
              {sortBy === 'quantity' ? (
                <span className="font-medium text-ink">Quantity</span>
              ) : (
                <Link href={sortLinkParams('quantity')} className="text-marine underline-offset-2 hover:underline">
                  Quantity
                </Link>
              )}
            </p>
            {sortedTopSellers.length === 0 ? (
              <p className="text-sm text-slate">No items sold in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Quantity</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {sortedTopSellers.map((row) => (
                      <tr key={`${row.type}:${row.itemId}`} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.type}</td>
                        <td className="px-3 py-2 text-ink">{row.name}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.quantity}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
