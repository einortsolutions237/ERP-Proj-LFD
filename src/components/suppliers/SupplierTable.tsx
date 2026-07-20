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
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const query = search.trim().toLowerCase()
  const filtered = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      (s.contact.phone ?? '').toLowerCase().includes(query) ||
      (s.contact.email ?? '').toLowerCase().includes(query)
  )

  async function handleDelete(row: SupplierRow) {
    if (!confirm(`Delete ${row.name}? This cannot be undone.`)) return
    setError(null)
    setDeletingId(row.id)
    try {
      const res = await fetch(`/api/suppliers/${row.id}`, { method: 'DELETE' })
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
      <label htmlFor="supplier-search" className="sr-only">
        Search suppliers
      </label>
      <input
        id="supplier-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, phone, or email…"
        className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
      />
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
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Phone</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Email</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate">
                    {suppliers.length === 0 ? 'No suppliers yet — add one to get started.' : 'No suppliers match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                    <td className="max-w-[14rem] truncate px-3 py-2 text-ink" title={row.name}>
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-ink">{row.contact.phone ?? '—'}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-ink" title={row.contact.email ?? undefined}>
                      {row.contact.email ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/suppliers/${row.id}`}
                          className="inline-flex min-h-11 items-center rounded-lg px-2 text-marine transition-colors duration-200 hover:bg-mist"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={deletingId === row.id}
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
