'use client'
import { useState } from 'react'
import Link from 'next/link'
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

  const cancelHref = mode === 'create' ? '/departments' : `/departments/${departmentId}`

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
        setError(body.error ?? 'Could not save — check your connection and try again.')
        setSubmitting(false)
        return
      }
      router.push('/departments')
    } catch {
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="department-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="department-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {mode === 'edit' && (
        <div>
          <label htmlFor="department-status" className="block text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="department-status"
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
          {submitting ? 'Saving…' : mode === 'create' ? 'Create department' : 'Save changes'}
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
