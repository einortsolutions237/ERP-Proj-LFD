import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import ProductTable, { type ProductRow } from '@/components/products/ProductTable'

export default async function ProductsPage() {
  try {
    await requireCapability('inventory.catalog.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // Unfiltered on purpose: products are an org-wide catalog collection, not
  // branch-scoped (same reasoning as branches/suppliers).
  const snap = await getAdminFirestore().collection('products').get()
  const products: ProductRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? '',
    } as ProductRow
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Products</h1>
        <Link
          href="/products/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-marine px-3 text-paper transition-opacity duration-200"
        >
          Add product
        </Link>
      </div>
      <ProductTable products={products} />
    </div>
  )
}
