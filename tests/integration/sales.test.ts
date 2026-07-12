import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mockNextHeaders, withSession } from '../setup/mockSession'

mockNextHeaders()

// Imported after mockNextHeaders() registers the vi.mock — Vitest hoists
// vi.mock calls automatically, but the import is kept below the call for
// readability of intent.
import { POST as postSale, GET as getSales } from '@/app/api/sales/route'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { resetEmulator, seedBranch, seedStaff, seedProduct, seedProductStock, seedCustomer } from '../setup/fixtures'

describe('POST /api/sales — full transaction behavior', () => {
  let branchId: string
  let cashierCookie: string
  let productId: string

  beforeAll(async () => {
    await resetEmulator()
    const branch = await seedBranch('Test Branch')
    branchId = branch.id
    const cashier = await seedStaff({ role: 'cashier', branchId, email: 'cashier@test.local' })
    cashierCookie = cashier.sessionCookie
    const product = await seedProduct({ name: 'Widget', price: 1000 })
    productId = product.id
    await seedProductStock({ branchId, productId, quantity: 10 })
  })

  function saleRequest(body: unknown) {
    return new Request('http://localhost/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('ignores a client-supplied price and resolves it server-side from the catalog', async () => {
    const res = await withSession(cashierCookie, () =>
      postSale(
        saleRequest({
          lineItems: [{ type: 'product', itemId: productId, quantity: 1, unitPrice: 999999 }],
          payments: [{ method: 'cash', amount: 1000 }],
        })
      )
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.total).toBe(1000)

    const saleDoc = await getAdminFirestore().collection('sales').doc(body.id).get()
    expect(saleDoc.data()!.lineItems[0].unitPrice).toBe(1000)
  })

  it('decrements stock correctly for a sufficiently-stocked sale and leaves no backorder', async () => {
    const stockBefore = await getAdminFirestore().collection('productStock').doc(`${branchId}_${productId}`).get()
    const quantityBefore = stockBefore.data()!.quantity as number

    const res = await withSession(cashierCookie, () =>
      postSale(saleRequest({ lineItems: [{ type: 'product', itemId: productId, quantity: 2 }], payments: [{ method: 'cash', amount: 2000 }] }))
    )
    expect(res.status).toBe(201)
    const body = await res.json()

    const stockAfter = await getAdminFirestore().collection('productStock').doc(`${branchId}_${productId}`).get()
    expect(stockAfter.data()!.quantity).toBe(quantityBefore - 2)

    const pendingDeliveries = await getAdminFirestore().collection('pendingDeliveries').where('saleId', '==', body.id).get()
    expect(pendingDeliveries.empty).toBe(true)

    const movements = await getAdminFirestore().collection('stockMovements').where('saleId', '==', body.id).get()
    expect(movements.docs).toHaveLength(1)
    expect(movements.docs[0].data().resultingQuantity).toBe(stockAfter.data()!.quantity)
  })

  it('rejects a payment sum that does not match the total (outside epsilon)', async () => {
    const res = await withSession(cashierCookie, () =>
      postSale(saleRequest({ lineItems: [{ type: 'product', itemId: productId, quantity: 1 }], payments: [{ method: 'cash', amount: 500 }] }))
    )
    expect(res.status).toBe(400)
  })

  it('accepts a payment sum within the epsilon tolerance', async () => {
    const res = await withSession(cashierCookie, () =>
      postSale(saleRequest({ lineItems: [{ type: 'product', itemId: productId, quantity: 1 }], payments: [{ method: 'cash', amount: 1000.005 }] }))
    )
    expect(res.status).toBe(201)
  })

  it('an insufficient-stock sale leaves stock at exactly zero and creates a correctly-sized pendingDeliveries record', async () => {
    const lowStockProduct = await seedProduct({ name: 'Scarce Widget', price: 500 })
    await seedProductStock({ branchId, productId: lowStockProduct.id, quantity: 3 })
    const customer = await seedCustomer({ name: 'Test Customer', phone: '+000111222' })

    const res = await withSession(cashierCookie, () =>
      postSale(
        saleRequest({
          lineItems: [{ type: 'product', itemId: lowStockProduct.id, quantity: 5 }],
          payments: [{ method: 'cash', amount: 2500 }],
          customerId: customer.id,
        })
      )
    )
    expect(res.status).toBe(201)
    const body = await res.json()

    const stockAfter = await getAdminFirestore().collection('productStock').doc(`${branchId}_${lowStockProduct.id}`).get()
    expect(stockAfter.data()!.quantity).toBe(0)

    const pending = await getAdminFirestore().collection('pendingDeliveries').where('saleId', '==', body.id).get()
    expect(pending.docs).toHaveLength(1)
    expect(pending.docs[0].data().quantityOwed).toBe(2)
  })

  it('a backorder without a customer is rejected 409 with nothing written', async () => {
    const lowStockProduct = await seedProduct({ name: 'Scarce Widget 2', price: 500 })
    await seedProductStock({ branchId, productId: lowStockProduct.id, quantity: 1 })

    const salesBefore = (await getAdminFirestore().collection('sales').get()).size

    const res = await withSession(cashierCookie, () =>
      postSale(saleRequest({ lineItems: [{ type: 'product', itemId: lowStockProduct.id, quantity: 5 }], payments: [{ method: 'cash', amount: 2500 }] }))
    )
    expect(res.status).toBe(409)

    const salesAfter = (await getAdminFirestore().collection('sales').get()).size
    expect(salesAfter).toBe(salesBefore)

    const stockAfter = await getAdminFirestore().collection('productStock').doc(`${branchId}_${lowStockProduct.id}`).get()
    expect(stockAfter.data()!.quantity).toBe(1) // untouched
  })

  it('replaying the same clientIdempotencyKey returns the existing sale and writes no new document', async () => {
    const key = 'idempotency-key-test-1'
    const body = { lineItems: [{ type: 'product', itemId: productId, quantity: 1 }], payments: [{ method: 'cash', amount: 1000 }], clientIdempotencyKey: key }

    const first = await withSession(cashierCookie, () => postSale(saleRequest(body)))
    expect(first.status).toBe(201)
    const firstBody = await first.json()

    const countAfterFirst = (await getAdminFirestore().collection('sales').get()).size

    const second = await withSession(cashierCookie, () => postSale(saleRequest(body)))
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    expect(secondBody.id).toBe(firstBody.id)

    const countAfterSecond = (await getAdminFirestore().collection('sales').get()).size
    expect(countAfterSecond).toBe(countAfterFirst)
  })
})

describe('GET /api/sales — requires pos.sale.view', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await withSession(null, () => getSales())
    expect(res.status).toBe(401)
  })
})
