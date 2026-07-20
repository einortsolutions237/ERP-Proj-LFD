'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Staff } from '@/lib/types/staff'

// Server Components can't pass Firestore Timestamp instances to Client
// Components (Next.js only serializes plain objects across that boundary),
// so the list page converts createdAt/updatedAt to ISO strings before handing
// rows to this table.
export type StaffRow = Omit<Staff, 'createdAt' | 'updatedAt'> & {
  id: string
  createdAt: string
  updatedAt: string
}

// Display-only — humanizes the raw role enum ("branch_manager" ->
// "Branch Manager") for the table cell; never used for any access decision.
function humanizeRole(role: string): string {
  return role
    .split('_')
    .map((word) => (word === 'hr' || word === 'it' ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

export default function StaffTable({ staff }: { staff: StaffRow[] }) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(row: StaffRow) {
    if (row.role === 'super_admin') return // structurally disabled below too; belt and suspenders
    if (!confirm(`Delete ${row.name}? This cannot be undone.`)) return
    setError(null)
    setDeletingId(row.id)
    try {
      const res = await fetch(`/api/staff/${row.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Could not delete — check your connection and try again.')
        return
      }
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Name</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Email</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Role</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Department</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate">
                    No staff members yet — add one to get started.
                  </td>
                </tr>
              ) : (
                staff.map((row) => (
                  <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                    <td className="max-w-[12rem] truncate px-3 py-2 text-ink" title={row.name}>
                      {row.name}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-ink" title={row.email}>
                      {row.email}
                    </td>
                    <td className="px-3 py-2 text-ink">{humanizeRole(row.role)}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-ink" title={row.department ?? undefined}>
                      {row.department ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {row.employment?.status === 'active' ? (
                        <span className="inline-block rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          active
                        </span>
                      ) : row.employment?.status === 'inactive' ? (
                        <span className="inline-block rounded-full bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                          inactive
                        </span>
                      ) : (
                        row.employment?.status ?? '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/staff/${row.id}`}
                          className="inline-flex min-h-11 items-center rounded-lg px-2 text-marine transition-colors duration-200 hover:bg-mist"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={row.role === 'super_admin' || deletingId === row.id}
                          onClick={() => handleDelete(row)}
                          className="inline-flex min-h-11 items-center rounded-lg px-2 text-danger transition-colors duration-200 hover:bg-danger/10 disabled:opacity-50"
                        >
                          {deletingId === row.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
