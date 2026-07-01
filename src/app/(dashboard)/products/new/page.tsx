import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import ProductForm from '@/components/products/ProductForm'

export default async function NewProductPage() {
  try {
    await requireCapability('inventory.catalog.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const suppliersSnap = await getAdminFirestore().collection('suppliers').get()
  const suppliers = suppliersSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Add product</h1>
      <ProductForm mode="create" suppliers={suppliers} />
    </div>
  )
}
