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

// Tender-chip background per payment method — cash stays deliberately quiet
// (neutral default), the two mobile-money brands lean on their approved
// tokens for real color identity (see design brief, Phase 9 Task 3).
const TENDER_CHIP_CARD: Record<PaymentMethod, string> = {
  cash: 'bg-mist text-ink',
  mtn_momo: 'bg-brass text-ink',
  orange_money: 'bg-tender-orange text-ink',
}

// Small geometric glyphs — not the real MTN/Orange logos, just an abstract
// mark to give each mobile-money chip a distinct silhouette at a glance.
function TenderGlyph({ method, className }: { method: 'mtn_momo' | 'orange_money'; className?: string }) {
  const shared = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    className,
  }
  if (method === 'mtn_momo') {
    return (
      <svg {...shared}>
        <path d="M12 3 20 12 12 21 4 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }
  return (
    <svg {...shared}>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
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
        setQuickAddError(body.error ?? 'Customer could not be created — check your connection and try again.')
        setQuickAddSubmitting(false)
        return
      }
      setExtraCustomers((prev) => [...prev, { id: body.id, name: quickAddName, phone: quickAddPhone }])
      selectCustomer(body.id)
      setQuickAddSubmitting(false)
    } catch {
      setQuickAddError('Customer could not be created — check your connection and try again.')
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
        setError(body.error ?? 'Sale could not be completed — check your connection and try again.')
        setSubmitting(false)
        return
      }
      router.push(`/pos/sales/${body.id}`)
    } catch {
      setError('Sale could not be completed — check your connection and try again.')
      setSubmitting(false)
    }
  }

  const submitDisabled = submitting || cart.length === 0 || Math.abs(balanceDue) >= 0.01

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 pb-24 md:grid-cols-2 md:pb-0">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-ink">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or services…"
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
        </div>
        <div className="max-h-96 divide-y divide-mist overflow-y-auto rounded-md border border-mist bg-paper">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product)}
              className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-mist"
            >
              <span className="text-ink">
                {product.name} <span className="text-sm text-slate">({product.sku})</span>
              </span>
              <span className="font-mono text-sm text-slate">
                {product.price.toFixed(2)} · qty {product.quantity}
              </span>
            </button>
          ))}
          {filteredServices.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => addService(service)}
              className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-mist"
            >
              <span className="text-ink">{service.name}</span>
              <span className="font-mono text-sm text-slate">{service.price.toFixed(2)}</span>
            </button>
          ))}
          {filteredProducts.length === 0 && filteredServices.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate">No products or services match your search.</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2 rounded-md border border-mist bg-paper p-3">
          <label className="block text-sm font-medium text-ink">Customer</label>
          {!customerPickerOpen && (
            <div className="flex items-center justify-between gap-2">
              {selectedCustomer ? (
                <>
                  <span className="text-sm text-ink">
                    {selectedCustomer.name} <span className="text-slate">({selectedCustomer.phone})</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomerPickerOpen(true)}
                      className="rounded-md border border-mist px-2 py-1 text-sm text-ink transition-colors hover:bg-mist"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={removeCustomer}
                      className="rounded-md border border-mist px-2 py-1 text-sm text-danger transition-colors hover:bg-mist"
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-slate">Walk-in</span>
                  <button
                    type="button"
                    onClick={() => setCustomerPickerOpen(true)}
                    className="rounded-md border border-mist px-2 py-1 text-sm text-ink transition-colors hover:bg-mist"
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
                  className="flex-1 rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
                />
                <button
                  type="button"
                  onClick={() => setCustomerPickerOpen(false)}
                  className="rounded-md border border-mist px-2 py-1 text-sm text-ink transition-colors hover:bg-mist"
                >
                  Close
                </button>
              </div>
              <div className="max-h-40 divide-y divide-mist overflow-y-auto rounded-md border border-mist">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-mist"
                  >
                    <span className="text-ink">{c.name}</span>
                    <span className="text-sm text-slate">{c.phone}</span>
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate">No matches</p>
                )}
              </div>

              <div className="space-y-2 border-t border-mist pt-3">
                <p className="text-sm font-medium text-ink">Quick add</p>
                <input
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Name"
                  className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
                />
                <input
                  value={quickAddPhone}
                  onChange={(e) => setQuickAddPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-full rounded-md border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
                />
                {quickAddError && <p className="text-sm text-danger">{quickAddError}</p>}
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  disabled={quickAddSubmitting || !quickAddName.trim() || !quickAddPhone.trim()}
                  className="rounded-md bg-marine px-3 py-2 text-paper transition-opacity disabled:opacity-50"
                >
                  Add customer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">Cart</h2>
          <div className="divide-y divide-mist rounded-md border border-mist">
            {cart.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate">
                Cart is empty — search for a product or service to add one.
              </p>
            )}
            {cart.map((line, index) => (
              <div key={`${line.type}-${line.itemId}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm text-ink">{line.name}</p>
                  <p className="font-mono text-xs text-slate">{line.unitPrice.toFixed(2)} each</p>
                </div>
                {line.type === 'product' ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setLineQuantity(index, line.quantity - 1)}
                      className="rounded-md border border-mist px-2 text-ink transition-colors hover:bg-mist"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={(e) => setLineQuantity(index, Number(e.target.value))}
                      className="w-14 rounded-md border border-mist px-2 py-1 text-center font-mono text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => setLineQuantity(index, line.quantity + 1)}
                      className="rounded-md border border-mist px-2 text-ink transition-colors hover:bg-mist"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span className="font-mono text-sm text-slate">qty 1</span>
                )}
                <p className="w-20 text-right font-mono text-sm text-ink">{(line.unitPrice * line.quantity).toFixed(2)}</p>
                <button type="button" onClick={() => removeLine(index)} className="px-2 text-danger">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink">Discount</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className="w-full rounded-md border border-mist bg-paper px-3 py-2 font-mono text-ink focus:border-marine"
          />
        </div>

        <div className="space-y-1 rounded-md border border-mist bg-mist/40 p-3 text-sm text-ink">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono">{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span className="font-mono">-{discount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-mist pt-1 font-semibold">
            <span>Total</span>
            <span className="font-mono">{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">Payment</h2>
          <div className="space-y-2">
            {payments.map((p) => {
              const hasAmount = Number(p.amount) > 0
              return (
                <div key={p.method} className={`relative overflow-hidden rounded-md p-3 ${TENDER_CHIP_CARD[p.method]}`}>
                  {p.method === 'cash' && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0 top-0 h-4 w-4 bg-paper/70"
                      style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
                    />
                  )}
                  <div className="mb-2 flex items-center gap-1.5">
                    {p.method !== 'cash' && <TenderGlyph method={p.method} className="h-4 w-4 opacity-70" />}
                    <span className="text-sm font-medium">{PAYMENT_METHOD_LABELS[p.method]}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.amount}
                    onChange={(e) => updatePayment(p.method, 'amount', e.target.value)}
                    className={`w-full rounded-md border bg-paper px-3 py-2 font-mono text-ink focus:border-marine ${
                      hasAmount ? 'border-ink/30 shadow-[inset_0_1px_5px_rgba(0,0,0,0.35)]' : 'border-mist'
                    }`}
                  />
                  {(p.method === 'mtn_momo' || p.method === 'orange_money') && (
                    <input
                      value={p.reference}
                      onChange={(e) => updatePayment(p.method, 'reference', e.target.value)}
                      placeholder="Reference"
                      className="mt-2 w-full rounded-md border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-sm text-ink">
            <span>Balance due</span>
            <span className="font-mono">{balanceDue.toFixed(2)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={submitDisabled}
          className="fixed inset-x-0 bottom-0 z-30 w-full rounded-none border-t border-mist bg-marine px-4 py-3 font-medium text-paper transition-opacity disabled:opacity-50 md:static md:inset-auto md:z-auto md:w-auto md:rounded-md md:border-0 md:px-4 md:py-2"
        >
          Complete sale
        </button>
      </div>
    </form>
  )
}
