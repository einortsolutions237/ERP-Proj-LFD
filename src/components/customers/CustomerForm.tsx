'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Customer } from '@/lib/types/customer'

export interface CustomerFormProps {
  mode: 'create' | 'edit'
  customerId?: string
  initial?: Partial<Customer>
}

export default function CustomerForm({ mode, customerId, initial }: CustomerFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const cancelHref = mode === 'create' ? '/customers' : `/customers/${customerId}`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      name,
      phone,
      email: email.trim() ? email : null,
      address: address.trim() ? address : null,
      notes: notes.trim() ? notes : null,
    }

    try {
      const res = await fetch(mode === 'create' ? '/api/customers' : `/api/customers/${customerId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not save — check your connection and try again.')
        setSubmitting(false)
        return
      }
      router.push(mode === 'create' ? `/customers/${body.id}` : `/customers/${customerId}`)
    } catch {
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <div>
        <label htmlFor="customer-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="customer-name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="customer-phone" className="block text-sm font-medium text-ink">
          Phone
        </label>
        <input
          id="customer-phone"
          required
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="customer-email" className="block text-sm font-medium text-ink">
          Email <span className="text-slate">(optional)</span>
        </label>
        <input
          id="customer-email"
          type="email"
          autoComplete="email"
          value={email ?? ''}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="customer-address" className="block text-sm font-medium text-ink">
          Address <span className="text-slate">(optional)</span>
        </label>
        <input
          id="customer-address"
          autoComplete="street-address"
          value={address ?? ''}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="customer-notes" className="block text-sm font-medium text-ink">
          Notes <span className="text-slate">(optional)</span>
        </label>
        <textarea
          id="customer-notes"
          value={notes ?? ''}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : mode === 'create' ? 'Create customer' : 'Save changes'}
        </button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-11 items-center rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
