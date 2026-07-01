'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Branch } from '@/lib/types/branch'

export interface BranchFormProps {
  mode: 'create' | 'edit'
  branchId?: string
  initial?: Partial<Branch>
}

export default function BranchForm({ mode, branchId, initial }: BranchFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = { name, address, phone: phone.trim() === '' ? null : phone }
    if (mode === 'edit') payload.active = active

    try {
      const res = await fetch(mode === 'create' ? '/api/branches' : `/api/branches/${branchId}`, {
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
      router.push('/branches')
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
        <label className="block text-sm font-medium">Address</label>
        <input required value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Phone</label>
        <input value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      {mode === 'edit' && (
        <div>
          <label className="block text-sm font-medium">Status</label>
          <select
            value={active ? 'active' : 'inactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
            className="w-full border rounded px-3 py-2"
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={submitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {mode === 'create' ? 'Create branch' : 'Save changes'}
      </button>
    </form>
  )
}
