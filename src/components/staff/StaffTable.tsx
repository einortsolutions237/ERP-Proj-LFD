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
        setError(body.error ?? 'Delete failed')
        return
      }
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="overflow-hidden rounded-2xl border border-mist shadow-[var(--shadow-card)] bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Email</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Role</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Department</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {staff.map((row) => (
              <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                <td className="px-3 py-2 text-ink">{row.name}</td>
                <td className="px-3 py-2 text-ink">{row.email}</td>
                <td className="px-3 py-2 text-ink">{row.role}</td>
                <td className="px-3 py-2 text-ink">{row.department ?? '—'}</td>
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
                <td className="px-3 py-2 space-x-3">
                  <Link href={`/staff/${row.id}`} className="text-marine underline-offset-2 hover:underline">
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={row.role === 'super_admin' || deletingId === row.id}
                    onClick={() => handleDelete(row)}
                    className="text-danger underline-offset-2 hover:underline disabled:text-slate disabled:no-underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
