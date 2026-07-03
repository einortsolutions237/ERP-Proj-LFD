import { redirect, notFound } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import ProductForm from '@/components/products/ProductForm'
import type { Product } from '@/lib/types/product'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    await requireCapability('inventory.catalog.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const doc = await db.collection('products').doc(id).get()
  if (!doc.exists) notFound()

  const data = doc.data() as Product

  const suppliersSnap = await db.collection('suppliers').get()
  const suppliers = suppliersSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }))

  const initial: Partial<Product> = {
    name: data.name,
    sku: data.sku,
    category: data.category,
    unitCost: data.unitCost,
    price: data.price,
    supplierId: data.supplierId,
    reorderThreshold: data.reorderThreshold,
    active: data.active,
  }

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="font-display text-2xl font-semibold text-ink">Edit product</h1>
      <ProductForm mode="edit" productId={id} initial={initial} suppliers={suppliers} />
    </div>
  )
}
