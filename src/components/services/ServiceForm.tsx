'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Service } from '@/lib/types/service'

export interface ServiceFormProps {
  mode: 'create' | 'edit'
  serviceId?: string
  initial?: Partial<Service>
}

export default function ServiceForm({ mode, serviceId, initial }: ServiceFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [price, setPrice] = useState(initial?.price?.toString() ?? '')
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes?.toString() ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      name,
      category,
      price: Number(price),
      durationMinutes: Number(durationMinutes),
      description: description ? description : null,
    }
    if (mode === 'edit') payload.active = active

    try {
      const res = await fetch(mode === 'create' ? '/api/services' : `/api/services/${serviceId}`, {
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
      router.push('/services')
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink">Name</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Category</label>
        <input
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Price</label>
        <input
          required
          type="number"
          min={0}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Duration (minutes)</label>
        <input
          required
          type="number"
          min={1}
          step={1}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-ink">Description</label>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {mode === 'edit' && (
        <div>
          <label className="block text-sm font-medium text-ink">Status</label>
          <select
            value={active ? 'active' : 'inactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
      >
        {mode === 'create' ? 'Create service' : 'Save changes'}
      </button>
    </form>
  )
}
