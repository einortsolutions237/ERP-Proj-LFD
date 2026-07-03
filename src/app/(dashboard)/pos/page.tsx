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
  const [productsSnap, servicesSnap, stockSnap, customersSnap] = await Promise.all([
    db.collection('products').where('active', '==', true).get(),
    db.collection('services').where('active', '==', true).get(),
    db.collection('productStock').where('branchId', '==', user.branchId).get(),
    db.collection('customers').get(),
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

  const customers = customersSnap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      name: data.name as string,
      phone: data.phone as string,
    }
  })

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Checkout</h1>
      <CheckoutForm products={products} services={services} customers={customers} branchId={user.branchId} />
    </div>
  )
}
