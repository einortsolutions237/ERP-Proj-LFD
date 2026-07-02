import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import CheckoutForm from '@/components/pos/CheckoutForm'

export default async function PosPage() {
  let user
  try {
    user = await requireCapability('pos.sale.create')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const [productsSnap, servicesSnap, stockSnap] = await Promise.all([
    db.collection('products').where('active', '==', true).get(),
    db.collection('services').where('active', '==', true).get(),
    db.collection('productStock').where('branchId', '==', user.branchId).get(),
  ])

  const quantityByProductId = new Map<string, number>()
  for (const d of stockSnap.docs) {
    const data = d.data()
    quantityByProductId.set(data.productId as string, data.quantity as number)
  }

  const products = productsSnap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name as string,
      sku: data.sku as string,
      price: data.price as number,
      quantity: quantityByProductId.get(d.id) ?? 0,
    }
  })

  const services = servicesSnap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name as string,
      price: data.price as number,
    }
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <h1 className="text-xl font-semibold">Checkout</h1>
      <CheckoutForm products={products} services={services} branchId={user.branchId} />
    </div>
  )
}
