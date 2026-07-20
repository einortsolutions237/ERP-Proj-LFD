'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Product } from '@/lib/types/product'

// Server Components can't pass Firestore Timestamp instances to Client
// Components (Next.js only serializes plain objects across that boundary),
// so the list page converts createdAt/updatedAt to ISO strings before handing
// rows to this table.
export type ProductRow = Omit<Product, 'createdAt' | 'updatedAt'> & {
  id: string
  createdAt: string
  updatedAt: string
}

export default function ProductTable({ products }: { products: ProductRow[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const query = search.trim().toLowerCase()
  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      p.sku.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query)
  )

  async function handleDelete(row: ProductRow) {
    if (!confirm(`Delete ${row.name}? This cannot be undone.`)) return
    setError(null)
    setDeletingId(row.id)
    try {
      const res = await fetch(`/api/products/${row.id}`, { method: 'DELETE' })
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
      <label htmlFor="product-search" className="sr-only">
        Search products
      </label>
      <input
        id="product-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, SKU, or category…"
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
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">SKU</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Category</th>
                <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">Price</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate">
                    {products.length === 0 ? 'No products yet — add one to get started.' : 'No products match your search.'}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                    <td className="max-w-[14rem] truncate px-3 py-2 text-ink" title={row.name}>
                      {row.name}
                    </td>
                    <td className="px-3 py-2 text-ink">{row.sku}</td>
                    <td className="max-w-[10rem] truncate px-3 py-2 text-ink" title={row.category}>
                      {row.category}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{row.price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-ink">
                      {row.active ? (
                        <span className="inline-block rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          active
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-slate/10 px-2 py-0.5 text-xs font-medium text-slate">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/products/${row.id}`}
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
