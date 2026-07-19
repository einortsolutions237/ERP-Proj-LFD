import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { queryPayrollRecords } from '@/lib/payroll/store'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'

export default async function PayrollPage() {
  let user
  try {
    user = await requireCapability('payroll.record.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const records = await queryPayrollRecords(user)

  const db = getAdminFirestore()
  const branchesSnap = await db.collection('branches').get()
  const branchNameById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))

  const staffUids = Array.from(new Set([...records.map((r) => r.staffId), ...records.map((r) => r.recordedBy)]))
  const staffDocs = await Promise.all(staffUids.map((uid) => db.collection('staff').doc(uid).get()))
  const staffNameByUid = new Map(staffDocs.filter((d) => d.exists).map((d) => [d.id, d.data()!.name as string]))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Payroll</h1>
        {hasCapability(user.role, 'payroll.record.create') && (
          <Link href="/payroll/new" className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50">
            Record payroll
          </Link>
        )}
      </div>
      {records.length === 0 ? (
        <p className="text-sm text-slate">No payroll records yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Staff</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Pay period</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Recorded by</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Notes</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Gross</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{staffNameByUid.get(record.staffId) ?? record.staffId}</td>
                  <td className="px-3 py-2 text-ink">{record.payPeriodStart.toDate().toISOString().slice(0, 10)} – {record.payPeriodEnd.toDate().toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-ink">{branchNameById.get(record.branchId) ?? record.branchId}</td>
                  <td className="px-3 py-2 text-ink">{staffNameByUid.get(record.recordedBy) ?? record.recordedBy}</td>
                  <td className="px-3 py-2 text-ink">{record.notes ?? ''}</td>
                  <td className="px-3 py-2 font-mono text-right text-ink">{record.grossAmount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
