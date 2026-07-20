'use client'
import { useState } from 'react'
import Link from 'next/link'
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
        setError(body.error ?? 'Could not save — check your connection and try again.')
        setSubmitting(false)
        return
      }
      router.push('/services')
    } catch {
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="service-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="service-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="service-category" className="block text-sm font-medium text-ink">
          Category
        </label>
        <input
          id="service-category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="service-price" className="block text-sm font-medium text-ink">
          Price
        </label>
        <input
          id="service-price"
          required
          type="number"
          min={0}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="service-duration" className="block text-sm font-medium text-ink">
          Duration (minutes)
        </label>
        <input
          id="service-duration"
          required
          type="number"
          min={1}
          step={1}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="service-description" className="block text-sm font-medium text-ink">
          Description
        </label>
        <textarea
          id="service-description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {mode === 'edit' && (
        <div>
          <label htmlFor="service-status" className="block text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="service-status"
            value={active ? 'active' : 'inactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
      )}
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
          {submitting ? 'Saving…' : mode === 'create' ? 'Create service' : 'Save changes'}
        </button>
        <Link
          href="/services"
          className="inline-flex min-h-11 items-center rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
