'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Product } from '@/lib/types/product'

export interface SupplierOption {
  id: string
  name: string
}

export interface ProductFormProps {
  mode: 'create' | 'edit'
  productId?: string
  initial?: Partial<Product>
  suppliers: SupplierOption[]
}

export default function ProductForm({ mode, productId, initial, suppliers }: ProductFormProps) {
  const router = useRouter()
  const [name, setName] = useState(initial?.name ?? '')
  const [sku, setSku] = useState(initial?.sku ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [unitCost, setUnitCost] = useState(initial?.unitCost?.toString() ?? '')
  const [price, setPrice] = useState(initial?.price?.toString() ?? '')
  const [reorderThreshold, setReorderThreshold] = useState(initial?.reorderThreshold?.toString() ?? '')
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '')
  const [active, setActive] = useState(initial?.active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const payload: Record<string, unknown> = {
      name,
      sku,
      category,
      unitCost: Number(unitCost),
      price: Number(price),
      reorderThreshold: Number(reorderThreshold),
      supplierId: supplierId ? supplierId : null,
    }
    if (mode === 'edit') payload.active = active

    try {
      const res = await fetch(mode === 'create' ? '/api/products' : `/api/products/${productId}`, {
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
      router.push('/products')
    } catch {
      setError('Could not save — check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="product-name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="product-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="product-sku" className="block text-sm font-medium text-ink">
          SKU
        </label>
        <input
          id="product-sku"
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="product-category" className="block text-sm font-medium text-ink">
          Category
        </label>
        <input
          id="product-category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="product-unit-cost" className="block text-sm font-medium text-ink">
          Unit cost
        </label>
        <input
          id="product-unit-cost"
          required
          type="number"
          min={0}
          step={0.01}
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="product-price" className="block text-sm font-medium text-ink">
          Price
        </label>
        <input
          id="product-price"
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
        <label htmlFor="product-reorder-threshold" className="block text-sm font-medium text-ink">
          Reorder threshold
        </label>
        <input
          id="product-reorder-threshold"
          required
          type="number"
          min={0}
          step={1}
          value={reorderThreshold}
          onChange={(e) => setReorderThreshold(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="product-supplier" className="block text-sm font-medium text-ink">
          Supplier
        </label>
        <select
          id="product-supplier"
          value={supplierId ?? ''}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink focus:border-marine"
        >
          <option value="">None</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {mode === 'edit' && (
        <div>
          <label htmlFor="product-status" className="block text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="product-status"
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
          {submitting ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
        </button>
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
