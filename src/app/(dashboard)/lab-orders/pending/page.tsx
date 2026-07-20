import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getPendingLabOrders } from '@/lib/clinical/getPendingLabOrders'

export default async function PendingLabOrdersPage() {
  let user
  try {
    user = await requireCapability('clinical.lab.results.enter')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const orders = await getPendingLabOrders(user)

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Pending Lab Orders</h1>
      {orders.length === 0 ? (
        <p className="text-sm text-slate">No pending lab orders.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-mist/40">
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Patient</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Test</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Ordering doctor</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Ordered</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {orders.map((row) => (
                  <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                    <td className="max-w-[12rem] truncate px-3 py-2 text-ink" title={row.customerName}>
                      {row.customerName}
                    </td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-ink" title={row.testName}>
                      {row.testName}
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-ink" title={row.doctorName}>
                      {row.doctorName}
                    </td>
                    <td className="px-3 py-2 text-ink">{new Date(row.orderedAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-ink">
                      <Link
                        href={`/customers/${row.customerId}`}
                        className="inline-flex min-h-11 items-center text-marine underline-offset-2 transition-colors duration-200 hover:underline"
                      >
                        Open patient
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
