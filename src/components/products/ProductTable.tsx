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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(row: ProductRow) {
    if (!confirm(`Delete ${row.name}? This cannot be undone.`)) return
    setError(null)
    setDeletingId(row.id)
    try {
      const res = await fetch(`/api/products/${row.id}`, { method: 'DELETE' })
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
      <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-mist/40">
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">SKU</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Category</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Price</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {products.map((row) => (
              <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                <td className="px-3 py-2 text-ink">{row.name}</td>
                <td className="px-3 py-2 text-ink">{row.sku}</td>
                <td className="px-3 py-2 text-ink">{row.category}</td>
                <td className="px-3 py-2 font-mono text-right text-ink">{row.price.toFixed(2)}</td>
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
                <td className="px-3 py-2 space-x-3">
                  <Link href={`/products/${row.id}`} className="text-marine underline-offset-2 hover:underline">
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={deletingId === row.id}
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
