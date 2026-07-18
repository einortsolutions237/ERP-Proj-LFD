import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildPnLReport, ReportValidationError, PnLValidationError } from '@/lib/reports/pnl'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { isBranchLocked } from '@/lib/auth/permissions'

export default async function PnLReportPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; branchId?: string }>
}) {
  const { startDate: startParam, endDate: endParam, branchId: branchIdParam } = await searchParams

  let user
  try {
    user = await requireCapability('accounting.pnl.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  let report: Awaited<ReturnType<typeof buildPnLReport>> | null = null
  let rangeError: string | null = null
  try {
    report = await buildPnLReport(user, startParam ?? null, endParam ?? null, branchIdParam ?? null)
  } catch (err) {
    if (err instanceof ReportValidationError || err instanceof PnLValidationError) {
      rangeError = err.message
    } else {
      throw err
    }
  }

  const startValue = report ? report.range.start.slice(0, 10) : startParam ?? ''
  const endValue = report ? report.range.end.slice(0, 10) : endParam ?? ''

  const db = getAdminFirestore()
  const branchesSnap = await db.collection('branches').get()
  const branches = branchesSnap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <h1 className="font-display text-2xl font-semibold text-ink">Profit &amp; loss</h1>

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
        {!isBranchLocked(user.role) && (
          <div>
            <label className="block text-sm font-medium text-ink">Branch</label>
            <select
              name="branchId"
              defaultValue={branchIdParam ?? ''}
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="rounded-lg bg-marine px-3 py-2 text-sm text-paper transition-opacity duration-200 disabled:opacity-50">
          View
        </button>
      </form>

      {rangeError && <p className="text-sm text-danger">{rangeError}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Revenue</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.revenueTotal.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Expenses</div>
              <div className="font-mono text-lg font-semibold text-ink">{report.expenseTotal.toFixed(2)}</div>
            </div>
            <div className="rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
              <div className="text-xs text-slate">Net income (pre-tax)</div>
              <div className={`font-mono text-lg font-semibold ${report.netIncome < 0 ? 'text-danger' : 'text-ink'}`}>
                {report.netIncome.toFixed(2)}
              </div>
            </div>
          </div>

          <section>
            <h2 className="text-lg font-medium text-ink mb-2">Expenses by category</h2>
            {report.expensesByCategory.length === 0 ? (
              <p className="text-sm text-slate">No expenses in this range.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Category</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {report.expensesByCategory.map((row) => (
                      <tr key={row.category} className="hover:bg-mist/40 transition-colors duration-200">
                        <td className="px-3 py-2 text-ink">{row.category}</td>
                        <td className="px-3 py-2 font-mono text-right text-ink">{row.amount.toFixed(2)}</td>
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
