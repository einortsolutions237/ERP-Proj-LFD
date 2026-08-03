import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import PageHeader from '@/components/ui/PageHeader'
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
      <PageHeader title="Record expense" />
      <ExpenseForm />
    </div>
  )
}
