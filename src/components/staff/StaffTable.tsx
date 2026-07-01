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
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Department</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {staff.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-2 pr-4">{row.name}</td>
              <td className="py-2 pr-4">{row.email}</td>
              <td className="py-2 pr-4">{row.role}</td>
              <td className="py-2 pr-4">{row.department ?? '—'}</td>
              <td className="py-2 pr-4">{row.employment?.status ?? '—'}</td>
              <td className="py-2 pr-4 space-x-2">
                <Link href={`/staff/${row.id}`} className="underline">
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={row.role === 'super_admin' || deletingId === row.id}
                  onClick={() => handleDelete(row)}
                  className="text-red-600 underline disabled:text-gray-400 disabled:no-underline"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
