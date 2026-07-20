import { notFound, redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import { getSaleDetail } from '@/lib/pos/getSaleDetail'
import VoidSaleButton from '@/components/pos/VoidSaleButton'
import PrintReceiptButton from '@/components/pos/PrintReceiptButton'

const DELIVERY_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  fulfilled: 'bg-success/10 text-success',
}

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let user
  try {
    user = await requireCapability('pos.sale.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const sale = await getSaleDetail(id, user)
  if (!sale) notFound()

  const createdAtDisplay = new Date(sale.createdAt).toLocaleString()

  return (
    <div className="space-y-8">
      {/* ---- On-screen detail view (hidden from the printed page) ---- */}
      <div className="mx-auto mt-4 max-w-4xl space-y-8 print:hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Sale detail</h1>
            <p className="text-sm text-slate">
              {createdAtDisplay} &middot; {sale.branchName} &middot; Cashier {sale.cashierName}
            </p>
            {sale.customerName && <p className="text-sm text-slate">Customer: {sale.customerName}</p>}
            {sale.voided ? (
              <div className="mt-2 space-y-1">
                <span className="inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                  Voided
                </span>
                <p className="text-sm text-slate">
                  Voided {sale.voidedAt ? new Date(sale.voidedAt).toLocaleString() : ''} by {sale.voidedByName} —{' '}
                  {sale.voidReason}
                </p>
              </div>
            ) : (
              hasCapability(user.role, 'pos.sale.void') && (
                <div className="mt-2">
                  <VoidSaleButton saleId={id} />
                </div>
              )
            )}
          </div>
          <PrintReceiptButton />
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium text-ink">Line items</h2>
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Item</th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Type</th>
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">
                      Unit Price (FCFA)
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">Qty</th>
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">
                      Line Total (FCFA)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {sale.lineItems.map((line, i) => (
                    <tr key={i} className="transition-colors duration-200 hover:bg-mist/40">
                      <td className="max-w-[16rem] truncate px-3 py-2 text-ink" title={line.name}>
                        {line.name}
                      </td>
                      <td className="px-3 py-2 text-ink">{line.type}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink">{line.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink">{line.quantity}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink">{line.lineTotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="max-w-xs space-y-1 rounded-2xl border border-mist bg-surface p-4 text-sm shadow-[var(--shadow-card)]">
          <div className="flex justify-between">
            <span className="text-slate">Subtotal</span>
            <span className="font-mono text-ink">{sale.subtotal.toFixed(2)} FCFA</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">Discount</span>
            <span className="font-mono text-ink">{sale.discountAmount.toFixed(2)} FCFA</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate">Tax</span>
            <span className="font-mono text-ink">{sale.taxAmount.toFixed(2)} FCFA</span>
          </div>
          <div className="flex justify-between border-t border-mist pt-1 font-semibold">
            <span className="text-ink">Total</span>
            <span className="font-mono text-ink">{sale.total.toFixed(2)} FCFA</span>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-medium text-ink">Payments</h2>
          <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-mist/40">
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                      Method
                    </th>
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">
                      Amount (FCFA)
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                      Reference
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {sale.payments.map((p, i) => (
                    <tr key={i} className="transition-colors duration-200 hover:bg-mist/40">
                      <td className="px-3 py-2 text-ink">{p.method}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink">{p.amount.toFixed(2)}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-ink" title={p.reference ?? undefined}>
                        {p.reference ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {sale.pendingDeliveries.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-medium text-ink">Pending deliveries from this sale</h2>
            <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-mist/40">
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                        Product
                      </th>
                      <th scope="col" className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate">
                        Qty owed
                      </th>
                      <th scope="col" className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist">
                    {sale.pendingDeliveries.map((d) => (
                      <tr key={d.id} className="transition-colors duration-200 hover:bg-mist/40">
                        <td className="max-w-[16rem] truncate px-3 py-2 text-ink" title={d.productName}>
                          {d.productName}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-ink">{d.quantityOwed}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                              DELIVERY_STATUS_BADGE[d.status] ?? 'bg-slate/10 text-slate'
                            }`}
                          >
                            {d.status}
                          </span>
                          {d.status === 'fulfilled' && (
                            <span className="ml-2 text-xs text-slate">
                              {d.fulfilledByName ? `by ${d.fulfilledByName}` : ''}
                              {d.fulfilledAt ? ` on ${new Date(d.fulfilledAt).toLocaleString()}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- Print-only receipt (invisible on screen, the only thing that
          prints). Plain black-on-white — receipts print on B/W printers, so
          this deliberately does not use the ink/marine/etc. color tokens. ---- */}
      <div className="hidden print:block print:p-6 print:text-black">
        <div className="mx-auto max-w-sm space-y-3 text-sm">
          <div className="text-center">
            <p className="text-base font-semibold">LFD Services</p>
            <p>{sale.branchName}</p>
            <p>{createdAtDisplay}</p>
          </div>
          {sale.voided && <p className="text-center font-semibold">*** VOIDED ***</p>}
          <div className="border-t border-black/40 pt-2">
            {sale.lineItems.map((line, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {line.name} × {line.quantity}
                </span>
                <span className="shrink-0 font-mono">{line.lineTotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-black/40 pt-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono">{sale.subtotal.toFixed(2)} FCFA</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span className="font-mono">{sale.discountAmount.toFixed(2)} FCFA</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span className="font-mono">{sale.taxAmount.toFixed(2)} FCFA</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono">{sale.total.toFixed(2)} FCFA</span>
            </div>
          </div>
          <div className="space-y-1 border-t border-black/40 pt-2">
            {sale.payments.map((p, i) => (
              <div key={i} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {p.method}
                  {p.reference ? ` (${p.reference})` : ''}
                </span>
                <span className="shrink-0 font-mono">{p.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-black/40 pt-2 text-xs">
            <p>Cashier: {sale.cashierName}</p>
            {sale.customerName && <p>Customer: {sale.customerName}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
