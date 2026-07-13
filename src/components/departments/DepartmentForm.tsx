'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Department } from '@/lib/types/department'

export interface DepartmentFormProps {
  mode: 'create' | 'edit'
  departmentId?: string
  initial?: Partial<Department>
}

export default function DepartmentForm({ mode, departmentId, initial }: DepartmentFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = { name }
    if (mode === 'edit') payload.active = active

    try {
      const res = await fetch(mode === 'create' ? '/api/departments' : `/api/departments/${departmentId}`, {
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
      router.push('/departments')
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
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {mode === 'edit' && (
        <div>
          <label className="block text-sm font-medium text-ink">Status</label>
          <select
            value={active ? 'active' : 'inactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
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
        className="rounded-lg bg-marine px-3 py-2 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        {mode === 'create' ? 'Create department' : 'Save changes'}
      </button>
    </form>
  )
}
