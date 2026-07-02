'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type CartLineType = 'product' | 'service'
type PaymentMethod = 'cash' | 'mtn_momo' | 'orange_money'

interface CartLine {
  type: CartLineType
  itemId: string
  name: string
  unitPrice: number
  quantity: number
}

interface PaymentRow {
  method: PaymentMethod
  amount: string
  reference: string
}

export interface CheckoutFormProps {
  products: { id: string; name: string; sku: string; price: number; quantity: number }[]
  services: { id: string; name: string; price: number }[]
  customers: { id: string; name: string; phone: string }[]
  branchId: string
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  orange_money: 'Orange Money',
}

export default function CheckoutForm({ products, services, customers }: CheckoutFormProps) {
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddPhone, setQuickAddPhone] = useState('')
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false)
  // Customers created via quick-add mid-checkout aren't in the server-fetched
  // `customers` prop; track them locally so the selected customer can be
  // displayed immediately without an extra round trip.
  const [extraCustomers, setExtraCustomers] = useState<{ id: string; name: string; phone: string }[]>([])
  const [discountAmount, setDiscountAmount] = useState('')
  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: 'cash', amount: '', reference: '' },
    { method: 'mtn_momo', amount: '', reference: '' },
    { method: 'orange_money', amount: '', reference: '' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const query = search.trim().toLowerCase()
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(query))
  const filteredServices = services.filter((s) => s.name.toLowerCase().includes(query))

  const allCustomers = [...customers, ...extraCustomers]
  const customerQuery = customerSearch.trim().toLowerCase()
  const filteredCustomers = allCustomers.filter(
    (c) => c.name.toLowerCase().includes(customerQuery) || c.phone.toLowerCase().includes(customerQuery)
  )
  const selectedCustomer = customerId ? allCustomers.find((c) => c.id === customerId) ?? null : null

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const discount = Number(discountAmount) || 0
  const total = Math.max(0, subtotal - discount)
  const paymentsSum = payments
    .filter((p) => Number(p.amount) > 0)
    .reduce((sum, p) => sum + Number(p.amount), 0)
  const balanceDue = total - paymentsSum

  function addProduct(product: { id: string; name: string; price: number }) {
    setCart((prev) => {
      const idx = prev.findIndex((line) => line.type === 'product' && line.itemId === product.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 }
        return next
      }
      return [...prev, { type: 'product', itemId: product.id, name: product.name, unitPrice: product.price, quantity: 1 }]
    })
  }

  function addService(service: { id: string; name: string; price: number }) {
    setCart((prev) => [
      ...prev,
      { type: 'service', itemId: service.id, name: service.name, unitPrice: service.price, quantity: 1 },
    ])
  }

  function setLineQuantity(index: number, quantity: number) {
    if (quantity < 1) return
    setCart((prev) => prev.map((line, i) => (i === index ? { ...line, quantity } : line)))
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  function updatePayment(method: PaymentMethod, field: 'amount' | 'reference', value: string) {
    setPayments((prev) => prev.map((p) => (p.method === method ? { ...p, [field]: value } : p)))
  }

  function selectCustomer(id: string) {
    setCustomerId(id)
    setCustomerPickerOpen(false)
    setCustomerSearch('')
    setQuickAddName('')
    setQuickAddPhone('')
    setQuickAddError(null)
  }

  function removeCustomer() {
    setCustomerId(null)
  }

  async function handleQuickAdd() {
    setQuickAddError(null)
    setQuickAddSubmitting(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: quickAddName, phone: quickAddPhone }),
      })
      const body = await res.json()
      if (!res.ok) {
        setQuickAddError(body.error ?? 'Customer could not be created')
        setQuickAddSubmitting(false)
        return
      }
      setExtraCustomers((prev) => [...prev, { id: body.id, name: quickAddName, phone: quickAddPhone }])
      selectCustomer(body.id)
      setQuickAddSubmitting(false)
    } catch {
      setQuickAddError('Customer could not be created')
      setQuickAddSubmitting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineItems: cart.map((line) => ({ type: line.type, itemId: line.itemId, quantity: line.quantity })),
          discountAmount: discount,
          payments: payments
            .filter((p) => Number(p.amount) > 0)
            .map((p) => ({ method: p.method, amount: Number(p.amount), reference: p.reference.trim() || null })),
          ...(customerId ? { customerId } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Sale could not be completed')
        setSubmitting(false)
        return
      }
      router.push(`/pos/sales/${body.id}`)
    } catch {
      setError('Sale could not be completed')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or services…"
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div className="border rounded divide-y max-h-96 overflow-y-auto">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
            >
              <span>
                {product.name} <span className="text-gray-500 text-sm">({product.sku})</span>
              </span>
              <span className="text-sm text-gray-500">
                {product.price.toFixed(2)} · qty {product.quantity}
              </span>
            </button>
          ))}
          {filteredServices.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => addService(service)}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
            >
              <span>{service.name}</span>
              <span className="text-sm text-gray-500">{service.price.toFixed(2)}</span>
            </button>
          ))}
          {filteredProducts.length === 0 && filteredServices.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">No matches</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="border rounded p-3 space-y-2">
          <label className="block text-sm font-medium">Customer</label>
          {!customerPickerOpen && (
            <div className="flex items-center justify-between gap-2">
              {selectedCustomer ? (
                <>
                  <span className="text-sm">
                    {selectedCustomer.name} <span className="text-gray-500">({selectedCustomer.phone})</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomerPickerOpen(true)}
                      className="text-sm border rounded px-2 py-1"
                    >
                      Change
                    </button>
                    <button type="button" onClick={removeCustomer} className="text-sm text-red-600 border rounded px-2 py-1">
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-500">Walk-in</span>
                  <button
                    type="button"
                    onClick={() => setCustomerPickerOpen(true)}
                    className="text-sm border rounded px-2 py-1"
                  >
                    Attach customer
                  </button>
                </>
              )}
            </div>
          )}

          {customerPickerOpen && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search name or phone…"
                  className="flex-1 border rounded px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => setCustomerPickerOpen(false)}
                  className="text-sm border rounded px-2 py-1"
                >
                  Close
                </button>
              </div>
              <div className="border rounded divide-y max-h-40 overflow-y-auto">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c.id)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>{c.name}</span>
                    <span className="text-sm text-gray-500">{c.phone}</span>
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-500">No matches</p>
                )}
              </div>

              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium">Quick add</p>
                <input
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Name"
                  className="w-full border rounded px-3 py-2"
                />
                <input
                  value={quickAddPhone}
                  onChange={(e) => setQuickAddPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-full border rounded px-3 py-2"
                />
                {quickAddError && <p className="text-red-600 text-sm">{quickAddError}</p>}
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  disabled={quickAddSubmitting || !quickAddName.trim() || !quickAddPhone.trim()}
                  className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
                >
                  Add customer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border rounded divide-y">
          {cart.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">Cart is empty</p>}
          {cart.map((line, index) => (
            <div key={`${line.type}-${line.itemId}-${index}`} className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm">{line.name}</p>
                <p className="text-xs text-gray-500">{line.unitPrice.toFixed(2)} each</p>
              </div>
              {line.type === 'product' ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLineQuantity(index, line.quantity - 1)}
                    className="border rounded px-2"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={line.quantity}
                    onChange={(e) => setLineQuantity(index, Number(e.target.value))}
                    className="w-14 border rounded px-2 py-1 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setLineQuantity(index, line.quantity + 1)}
                    className="border rounded px-2"
                  >
                    +
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-500">qty 1</span>
              )}
              <p className="w-20 text-right text-sm">{(line.unitPrice * line.quantity).toFixed(2)}</p>
              <button type="button" onClick={() => removeLine(index)} className="text-red-600 px-2">
                ×
              </button>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium">Discount</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{discount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Payment</label>
          {payments.map((p) => (
            <div key={p.method} className="flex items-center gap-2">
              <span className="w-28 text-sm">{PAYMENT_METHOD_LABELS[p.method]}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={p.amount}
                onChange={(e) => updatePayment(p.method, 'amount', e.target.value)}
                className="w-28 border rounded px-3 py-2"
              />
              {(p.method === 'mtn_momo' || p.method === 'orange_money') && (
                <input
                  value={p.reference}
                  onChange={(e) => updatePayment(p.method, 'reference', e.target.value)}
                  placeholder="Reference"
                  className="flex-1 border rounded px-3 py-2"
                />
              )}
            </div>
          ))}
          <div className="flex justify-between text-sm">
            <span>Balance due</span>
            <span>{balanceDue.toFixed(2)}</span>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting || cart.length === 0 || Math.abs(balanceDue) >= 0.01}
          className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
        >
          Complete sale
        </button>
      </div>
    </form>
  )
}
