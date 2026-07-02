'use client'
import { useState } from 'react'
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
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      router.push(mode === 'create' ? `/customers/${body.id}` : `/customers/${customerId}`)
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Phone</label>
        <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Email</label>
        <input value={email ?? ''} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Address</label>
        <input value={address ?? ''} onChange={(e) => setAddress(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Notes</label>
        <textarea value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={submitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {mode === 'create' ? 'Create customer' : 'Save changes'}
      </button>
    </form>
  )
}
