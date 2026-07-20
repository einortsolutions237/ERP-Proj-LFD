import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { queryExpenses } from '@/lib/expenses/store'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'

export default async function ExpensesPage() {
  let user
  try {
    user = await requireCapability('accounting.expense.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const expenses = await queryExpenses(user)

  const db = getAdminFirestore()
  const branchesSnap = await db.collection('branches').get()
  const branchNameById = new Map(branchesSnap.docs.map((d) => [d.id, d.data().name as string]))

  const recorderUids = Array.from(new Set(expenses.map((e) => e.recordedBy)))
  const staffDocs = await Promise.all(recorderUids.map((uid) => db.collection('staff').doc(uid).get()))
  const emailByUid = new Map(staffDocs.filter((d) => d.exists).map((d) => [d.id, d.data()!.email as string]))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Expenses</h1>
        {hasCapability(user.role, 'accounting.expense.create') && (
          <Link href="/expenses/new" className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50">
            Record expense
          </Link>
        )}
      </div>
      {expenses.length === 0 ? (
        <p className="text-sm text-slate">No expenses recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Category</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Recorded by</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Receipts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {expenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{expense.date.toDate().toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-ink">{expense.category}</td>
                  <td className="px-3 py-2 text-ink">{expense.description}</td>
                  <td className="px-3 py-2 text-ink">{branchNameById.get(expense.branchId) ?? expense.branchId}</td>
                  <td className="px-3 py-2 text-ink">{emailByUid.get(expense.recordedBy) ?? expense.recordedBy}</td>
                  <td className="px-3 py-2 font-mono text-right text-ink">{expense.amount.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    {expense.attachments.length > 0 ? (
                      <ul className="space-y-0.5">
                        {expense.attachments.map((a) => (
                          <li key={a.id} className="text-xs">
                            <a
                              href={`/api/attachments/${a.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-marine underline"
                            >
                              {a.fileName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-slate">—</span>
                    )}
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
