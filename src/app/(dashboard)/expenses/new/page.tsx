import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import ExpenseForm from './ExpenseForm'

export default async function NewExpensePage() {
  try {
    await requireCapability('accounting.expense.create')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Record expense</h1>
      <ExpenseForm />
    </div>
  )
}
