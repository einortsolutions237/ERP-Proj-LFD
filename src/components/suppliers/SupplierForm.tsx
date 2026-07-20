'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Supplier } from '@/lib/types/supplier'

export interface SupplierFormProps {
  mode: 'create' | 'edit'
  supplierId?: string
  initial?: Partial<Supplier>
}

export default function SupplierForm({ mode, supplierId, initial }: SupplierFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.contact?.phone ?? '')
  const [email, setEmail] = useState(initial?.contact?.email ?? '')
  const [address, setAddress] = useState(initial?.contact?.address ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload = {
      name,
      contact: {
        phone: phone.trim() ? phone : null,
        email: email.trim() ? email : null,
        address: address.trim() ? address : null,
      },
      notes: notes.trim() ? notes : null,
    }

    try {
      const res = await fetch(mode === 'create' ? '/api/suppliers' : `/api/suppliers/${supplierId}`, {
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
      router.push('/suppliers')
    } catch {
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="supplier-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="supplier-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="supplier-phone" className="block text-sm font-medium text-ink">
          Phone
        </label>
        <input
          id="supplier-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="supplier-email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="supplier-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="supplier-address" className="block text-sm font-medium text-ink">
          Address
        </label>
        <input
          id="supplier-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="supplier-notes" className="block text-sm font-medium text-ink">
          Notes
        </label>
        <textarea
          id="supplier-notes"
          value={notes}
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
          {submitting ? 'Saving…' : mode === 'create' ? 'Create supplier' : 'Save changes'}
        </button>
        <Link
          href="/suppliers"
          className="inline-flex min-h-11 items-center rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
