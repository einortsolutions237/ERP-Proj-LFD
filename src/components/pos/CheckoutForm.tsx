'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueueSale, type QueuedSaleReceipt as QueuedSaleReceiptData } from '@/lib/pos/offlineQueue'
import { saveCatalogCache, loadCatalogCache } from '@/lib/pos/catalogCache'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import QueuedSaleReceipt from './QueuedSaleReceipt'

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

const BALANCE_EPSILON = 0.01

// Tender-chip background per payment method — cash stays deliberately quiet
// (neutral default). Phase 25 replaced MTN MoMo/Orange Money's solid brand
// fills with the same /10-badge, /5-wash tint idiom DashboardCard's
// TONE_STYLES established in Phase 24, instead of flooding the section
// with a loud solid color block.
const TENDER_CHIP_CARD: Record<PaymentMethod, string> = {
  cash: 'bg-mist text-ink',
  mtn_momo: 'bg-brass/5 text-ink border border-brass/30',
  orange_money: 'bg-info/5 text-ink border border-info/30',
}

// Icon color per method — carries the brand identity that used to come
// from the solid fill; the label text stays neutral ink, matching
// DashboardCard's badge-icon-colored/title-neutral split.
const TENDER_GLYPH_COLOR: Record<'mtn_momo' | 'orange_money', string> = {
  mtn_momo: 'text-brass',
  orange_money: 'text-info',
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

export default function CheckoutForm({ products, services, customers, branchId }: CheckoutFormProps) {
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const [queuedReceipt, setQueuedReceipt] = useState<QueuedSaleReceiptData | null>(null)
  const [catalogCachedAt, setCatalogCachedAt] = useState<number | null>(null)

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

  // Whenever this page loads online, the props are fresh — record that as
  // the new "last synced" point. Whenever it doesn't, read back whatever
  // was last recorded so the offline banner (below) can say when the
  // catalog/stock numbers it's showing actually came from — see the
  // brief's "make clear in the UI... these numbers are from the last
  // successful sync, not live."
  useEffect(() => {
    if (navigator.onLine) {
      const cachedAt = Date.now()
      saveCatalogCache({ branchId, products, services, cachedAt })
      setCatalogCachedAt(cachedAt)
    } else {
      loadCatalogCache(branchId).then((entry) => {
        if (entry) setCatalogCachedAt(entry.cachedAt)
      })
    }
  }, [branchId, products, services])

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

  // Pair color with a label change (not color alone) so the settled vs.
  // still-owed vs. overpaid states are distinguishable without relying on
  // hue perception. "Change due" only appears once payments actually
  // exceed the total, since "balance due" would be a misleading label for
  // an overpayment.
  const balanceIsOverpaid = balanceDue < -BALANCE_EPSILON
  const balanceLabel = balanceIsOverpaid ? 'Change due' : 'Balance due'
  const balanceDisplay = Math.abs(balanceDue).toFixed(2)
  const balanceToneClass =
    balanceDue > BALANCE_EPSILON ? 'text-danger' : 'text-success'

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

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (filteredProducts.length > 0) {
      addProduct(filteredProducts[0])
    } else if (filteredServices.length > 0) {
      addService(filteredServices[0])
    }
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

  function handlePickerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setCustomerPickerOpen(false)
    }
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

    let idempotencyKey: string
    try {
      idempotencyKey = crypto.randomUUID()
    } catch {
      setError('Sale could not be completed — check your connection and try again.')
      setSubmitting(false)
      return
    }

    const payload = {
      lineItems: cart.map((line) => ({ type: line.type, itemId: line.itemId, quantity: line.quantity })),
      discountAmount: discount,
      payments: payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({ method: p.method, amount: Number(p.amount), reference: p.reference.trim() || null })),
      customerId: customerId ?? null,
    }

    async function queueOffline() {
      const receiptSnapshot = {
        lineItems: cart.map((line) => ({
          type: line.type,
          itemId: line.itemId,
          name: line.name,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.unitPrice * line.quantity,
        })),
        subtotal,
        total,
        payments: payload.payments,
        createdAtLocal: Date.now(),
      }
      await enqueueSale({
        idempotencyKey,
        payload,
        receiptSnapshot,
        status: 'queued',
        lastError: null,
        serverSaleId: null,
        createdAt: Date.now(),
      })
      setSubmitting(false)
      setQueuedReceipt(receiptSnapshot)
    }

    if (!navigator.onLine) {
      await queueOffline()
      return
    }

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, clientIdempotencyKey: idempotencyKey }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Sale could not be completed — check your connection and try again.')
        setSubmitting(false)
        return
      }
      router.push(`/pos/sales/${body.id}`)
    } catch {
      // fetch() itself threw — a genuine network-level failure despite
      // navigator.onLine reporting true. Falls back to the same queued
      // path, using the SAME idempotencyKey: if this request actually
      // reached the server and committed before the connection dropped,
      // the eventual queued retry's clientIdempotencyKey match returns
      // that same sale instead of creating a second one (see Task 2).
      await queueOffline()
    }
  }

  const submitDisabled = submitting || cart.length === 0 || Math.abs(balanceDue) >= BALANCE_EPSILON

  if (queuedReceipt) {
    return (
      <QueuedSaleReceipt
        receipt={queuedReceipt}
        onNewSale={() => {
          setQueuedReceipt(null)
          setCart([])
          setCustomerId(null)
          setDiscountAmount('')
          setPayments([
            { method: 'cash', amount: '', reference: '' },
            { method: 'mtn_momo', amount: '', reference: '' },
            { method: 'orange_money', amount: '', reference: '' },
          ])
        }}
      />
    )
  }

  return (
    <>
      {!isOnline && (
        <div className="mb-4 rounded-lg border border-info bg-info/10 px-3 py-2 text-sm text-ink">
          Offline — catalog and stock shown as of last sync
          {catalogCachedAt ? ` (${new Date(catalogCachedAt).toLocaleString()})` : ''}, not live.
        </div>
      )}
      <form onSubmit={handleSubmit} className="grid gap-6 pb-24 md:grid-cols-2 md:pb-0">
      <div className="space-y-3">
        <div>
          <label htmlFor="pos-search" className="block text-sm font-medium text-ink">
            Search
          </label>
          <input
            id="pos-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search products or services…"
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
          />
          <p className="mt-1 text-xs text-slate">Press Enter to add the top match.</p>
        </div>
        <div className="max-h-96 divide-y divide-mist overflow-y-auto rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-mist"
            >
              <span className="truncate text-ink" title={product.name}>
                {product.name} <span className="text-sm text-slate">({product.sku})</span>
              </span>
              <span className="shrink-0 font-mono text-sm text-slate text-right">
                {product.price.toFixed(2)} · qty {product.quantity}
              </span>
            </button>
          ))}
          {filteredServices.map((service) => (
            <button
              key={service.id}
              type="button"
              onClick={() => addService(service)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-mist"
            >
              <span className="truncate text-ink" title={service.name}>
                {service.name}
              </span>
              <span className="shrink-0 font-mono text-sm text-slate text-right">{service.price.toFixed(2)}</span>
            </button>
          ))}
          {filteredProducts.length === 0 && filteredServices.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate">No products or services match your search.</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2 rounded-2xl border border-mist bg-surface p-3 shadow-[var(--shadow-card)]">
          <label className="block text-sm font-medium text-ink">Customer</label>
          {!customerPickerOpen && (
            <div className="flex items-center justify-between gap-2">
              {selectedCustomer ? (
                <>
                  <span className="min-w-0 truncate text-sm text-ink" title={selectedCustomer.name}>
                    {selectedCustomer.name} <span className="text-slate">({selectedCustomer.phone})</span>
                  </span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomerPickerOpen(true)}
                      className="min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:border-marine hover:bg-mist"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={removeCustomer}
                      className="min-h-11 rounded-lg border border-mist px-3 text-sm text-danger transition-colors duration-200 hover:border-danger hover:bg-danger/10"
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
                    className="min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:border-marine hover:bg-mist"
                  >
                    Attach customer
                  </button>
                </>
              )}
            </div>
          )}

          {customerPickerOpen && (
            <div className="space-y-3" onKeyDown={handlePickerKeyDown}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="pos-customer-search" className="sr-only">
                  Search customers by name or phone
                </label>
                <input
                  id="pos-customer-search"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search name or phone…"
                  className="flex-1 rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
                />
                <button
                  type="button"
                  onClick={() => setCustomerPickerOpen(false)}
                  className="min-h-11 shrink-0 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:border-marine hover:bg-mist"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate">Press Esc to close.</p>
              <div className="max-h-40 divide-y divide-mist overflow-y-auto rounded-lg border border-mist">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors duration-200 hover:bg-mist"
                  >
                    <span className="truncate text-ink" title={c.name}>
                      {c.name}
                    </span>
                    <span className="shrink-0 text-sm text-slate">{c.phone}</span>
                  </button>
                ))}
                {filteredCustomers.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate">No matches</p>
                )}
              </div>

              <div className="space-y-2 border-t border-mist pt-3">
                <p className="text-sm font-medium text-ink">Quick add</p>
                <label htmlFor="pos-quick-add-name" className="sr-only">
                  Full name
                </label>
                <input
                  id="pos-quick-add-name"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Name"
                  className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
                />
                <label htmlFor="pos-quick-add-phone" className="sr-only">
                  Phone number
                </label>
                <input
                  id="pos-quick-add-phone"
                  value={quickAddPhone}
                  onChange={(e) => setQuickAddPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
                />
                {quickAddError && (
                  <p role="alert" className="text-sm text-danger">
                    {quickAddError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  disabled={quickAddSubmitting || !quickAddName.trim() || !quickAddPhone.trim()}
                  className="min-h-11 rounded-lg bg-marine px-3 py-2.5 text-paper transition-opacity duration-200 disabled:opacity-50"
                >
                  {quickAddSubmitting ? 'Adding…' : 'Add customer'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">Cart</h2>
          <div className="divide-y divide-mist rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            {cart.length === 0 && (
              <p className="px-3 py-2 text-sm text-slate">
                Cart is empty — search for a product or service to add one.
              </p>
            )}
            {cart.map((line, index) => (
              <div key={`${line.type}-${line.itemId}-${index}`} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink" title={line.name}>
                    {line.name}
                  </p>
                  <p className="font-mono text-xs text-slate">{line.unitPrice.toFixed(2)} each</p>
                </div>
                {line.type === 'product' ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setLineQuantity(index, line.quantity - 1)}
                      aria-label={`Decrease quantity of ${line.name}`}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-mist text-ink transition-colors duration-200 hover:border-marine hover:bg-mist"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={(e) => setLineQuantity(index, Number(e.target.value))}
                      aria-label={`Quantity of ${line.name}`}
                      className="w-14 rounded-lg border border-mist px-2 py-1 text-center font-mono text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => setLineQuantity(index, line.quantity + 1)}
                      aria-label={`Increase quantity of ${line.name}`}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-mist text-ink transition-colors duration-200 hover:border-marine hover:bg-mist"
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <span className="shrink-0 font-mono text-sm text-slate">qty 1</span>
                )}
                <p className="w-20 shrink-0 text-right font-mono text-sm text-ink">{(line.unitPrice * line.quantity).toFixed(2)}</p>
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  aria-label={`Remove ${line.name} from cart`}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-danger transition-colors duration-200 hover:bg-danger/10"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="pos-discount" className="block text-sm font-medium text-ink">
            Discount
          </label>
          <input
            id="pos-discount"
            type="number"
            min={0}
            step="0.01"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            className="w-full rounded-lg border border-mist bg-paper px-3 py-2 font-mono text-ink focus:border-marine"
          />
        </div>

        <div className="space-y-1 rounded-2xl border border-mist bg-mist/40 p-3 text-sm text-ink shadow-[var(--shadow-card)]">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono text-right">{subtotal.toFixed(2)} FCFA</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span className="font-mono text-right">-{discount.toFixed(2)} FCFA</span>
          </div>
          <div className="flex justify-between border-t border-mist pt-1 font-semibold">
            <span>Total</span>
            <span className="font-mono text-right">{total.toFixed(2)} FCFA</span>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">Payment</h2>
          <div className="space-y-2">
            {payments.map((p) => {
              const hasAmount = Number(p.amount) > 0
              const amountFieldId = `pos-payment-amount-${p.method}`
              const referenceFieldId = `pos-payment-reference-${p.method}`
              return (
                <div key={p.method} className={`relative overflow-hidden rounded-lg p-3 ${TENDER_CHIP_CARD[p.method]}`}>
                  {p.method === 'cash' && (
                    <span
                      aria-hidden="true"
                      className="absolute right-0 top-0 h-4 w-4 bg-paper/70"
                      style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }}
                    />
                  )}
                  <div className="mb-2 flex items-center gap-1.5">
                    {p.method !== 'cash' && (
                      <TenderGlyph method={p.method} className={`h-4 w-4 ${TENDER_GLYPH_COLOR[p.method]}`} />
                    )}
                    <label htmlFor={amountFieldId} className="text-sm font-medium">
                      {PAYMENT_METHOD_LABELS[p.method]}
                    </label>
                  </div>
                  <input
                    id={amountFieldId}
                    type="number"
                    min={0}
                    step="0.01"
                    value={p.amount}
                    onChange={(e) => updatePayment(p.method, 'amount', e.target.value)}
                    className={`w-full rounded-lg border bg-paper px-3 py-2 font-mono text-ink focus:border-marine ${
                      hasAmount ? 'border-ink/30 shadow-[inset_0_1px_5px_rgba(0,0,0,0.35)]' : 'border-mist'
                    }`}
                  />
                  {(p.method === 'mtn_momo' || p.method === 'orange_money') && (
                    <>
                      <label htmlFor={referenceFieldId} className="sr-only">
                        {PAYMENT_METHOD_LABELS[p.method]} reference
                      </label>
                      <input
                        id={referenceFieldId}
                        value={p.reference}
                        onChange={(e) => updatePayment(p.method, 'reference', e.target.value)}
                        placeholder="Reference"
                        className="mt-2 w-full rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink placeholder:text-slate focus:border-marine"
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-sm text-ink">
            <span>{balanceLabel}</span>
            <span className={`font-mono text-right font-medium ${balanceToneClass}`}>{balanceDisplay} FCFA</span>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="fixed inset-x-0 bottom-0 z-30 w-full rounded-none border-t border-mist bg-marine px-4 py-3 font-medium text-paper transition-opacity duration-200 disabled:opacity-50 md:static md:inset-auto md:z-auto md:w-auto md:rounded-lg md:border-0 md:px-4 md:py-2.5"
        >
          {submitting ? 'Completing sale…' : 'Complete sale'}
        </button>
      </div>
    </form>
    </>
  )
}
