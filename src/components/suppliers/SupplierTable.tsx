'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Supplier } from '@/lib/types/supplier'

// Server Components can't pass Firestore Timestamp instances to Client
// Components (Next.js only serializes plain objects across that boundary),
// so the list page converts createdAt/updatedAt to ISO strings before handing
// rows to this table.
export type SupplierRow = Omit<Supplier, 'createdAt' | 'updatedAt'> & {
  id: string
  createdAt: string
  updatedAt: string
}

export default function SupplierTable({ suppliers }: { suppliers: SupplierRow[] }) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(row: SupplierRow) {
    if (!confirm(`Delete ${row.name}? This cannot be undone.`)) return
    setError(null)
    setDeletingId(row.id)
    try {
      const res = await fetch(`/api/suppliers/${row.id}`, { method: 'DELETE' })
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
            <th className="py-2 pr-4">Phone</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {suppliers.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-2 pr-4">{row.name}</td>
              <td className="py-2 pr-4">{row.contact.phone ?? '—'}</td>
              <td className="py-2 pr-4">{row.contact.email ?? '—'}</td>
              <td className="py-2 pr-4 space-x-2">
                <Link href={`/suppliers/${row.id}`} className="underline">
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={deletingId === row.id}
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
