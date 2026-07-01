'use client'
import { useState } from 'react'
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
        setError(body.error ?? 'Request failed')
        setSubmitting(false)
        return
      }
      router.push('/products')
    } catch {
      setError('Request failed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">SKU</label>
        <input required value={sku} onChange={(e) => setSku(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Category</label>
        <input required value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Unit cost</label>
        <input
          required
          type="number"
          min={0}
          step={0.01}
          value={unitCost}
          onChange={(e) => setUnitCost(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Price</label>
        <input
          required
          type="number"
          min={0}
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Reorder threshold</label>
        <input
          required
          type="number"
          min={0}
          step={1}
          value={reorderThreshold}
          onChange={(e) => setReorderThreshold(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Supplier</label>
        <select value={supplierId ?? ''} onChange={(e) => setSupplierId(e.target.value)} className="w-full border rounded px-3 py-2">
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
          <label className="block text-sm font-medium">Status</label>
          <select
            value={active ? 'active' : 'inactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
            className="w-full border rounded px-3 py-2"
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={submitting} className="bg-black text-white rounded px-3 py-2 disabled:opacity-50">
        {mode === 'create' ? 'Create product' : 'Save changes'}
      </button>
    </form>
  )
}
