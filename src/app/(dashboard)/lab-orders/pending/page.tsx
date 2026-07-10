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
        <div className="overflow-hidden rounded-md border border-mist">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Patient</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Test</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Ordering doctor</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Ordered</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {orders.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40 transition-colors">
                  <td className="px-3 py-2 text-ink">{row.customerName}</td>
                  <td className="px-3 py-2 text-ink">{row.testName}</td>
                  <td className="px-3 py-2 text-ink">{row.doctorName}</td>
                  <td className="px-3 py-2 text-ink">{new Date(row.orderedAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-ink">
                    <Link href={`/customers/${row.customerId}`} className="text-marine underline-offset-2 hover:underline">
                      Open patient
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
