'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AttachReceiptForm from './AttachReceiptForm'
import Alert from '@/components/ui/Alert'
import FormSection from '@/components/ui/FormSection'
import Button from '@/components/ui/Button'

const CATEGORY_SUGGESTIONS = ['Rent', 'Utilities', 'Supplies', 'Salaries', 'Other']

export default function ExpenseForm() {
  const router = useRouter()
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdExpenseId, setCreatedExpenseId] = useState<string | null>(null)
  const [attachedFileNames, setAttachedFileNames] = useState<string[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = { date, category, amount: Number(amount), description }

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      setSubmitting(false)
      setCreatedExpenseId(body.id)
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  if (createdExpenseId) {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-ink">Expense recorded. Attach receipt scans below, or skip.</p>
        <AttachReceiptForm
          expenseId={createdExpenseId}
          onUploaded={(fileName) => setAttachedFileNames((prev) => [...prev, fileName])}
        />
        {attachedFileNames.length > 0 && (
          <ul className="space-y-1 text-xs text-slate">
            {attachedFileNames.map((name, i) => (
              <li key={i}>Attached: {name}</li>
            ))}
          </ul>
        )}
        <Button onClick={() => router.push('/expenses')}>Done</Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <FormSection>
        <div>
          <label htmlFor="expense-date" className="block text-sm font-medium text-ink">
            Date
          </label>
          <input
            id="expense-date"
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          />
        </div>
        <div>
          <label htmlFor="expense-category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <input
            id="expense-category"
            required
            list="expense-category-suggestions"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
          <datalist id="expense-category-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </FormSection>
      <FormSection>
        <div>
          <label htmlFor="expense-amount" className="block text-sm font-medium text-ink">
            Amount
          </label>
          <input
            id="expense-amount"
            required
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
      </FormSection>
      <div>
        <label htmlFor="expense-description" className="block text-sm font-medium text-ink">
          Description
        </label>
        <textarea
          id="expense-description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && <Alert tone="error" inline>{error}</Alert>}
      <Button type="submit" loading={submitting}>
        Record expense
      </Button>
    </form>
  )
}
