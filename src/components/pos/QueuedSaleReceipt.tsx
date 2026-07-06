'use client'
import type { QueuedSaleReceipt as QueuedSaleReceiptData } from '@/lib/pos/offlineQueue'

export interface QueuedSaleReceiptProps {
  receipt: QueuedSaleReceiptData
  onNewSale: () => void
}

export default function QueuedSaleReceipt({ receipt, onNewSale }: QueuedSaleReceiptProps) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-md border border-mist p-6">
      <div className="rounded-md border border-tender-orange bg-tender-orange/10 px-3 py-2 text-sm text-ink">
        <strong>Provisional receipt</strong> — not yet confirmed by the server. This sale is queued and will sync
        automatically once the connection returns.
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">Sale queued</h2>
      <div className="space-y-1 text-sm">
        {receipt.lineItems.map((line, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-ink">
              {line.name} × {line.quantity}
            </span>
            <span className="font-mono text-ink">{line.lineTotal.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="space-y-1 border-t border-mist pt-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate">Subtotal</span>
          <span className="font-mono text-ink">{receipt.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span className="text-ink">Total</span>
          <span className="font-mono text-ink">{receipt.total.toFixed(2)}</span>
        </div>
      </div>
      <p className="text-xs text-slate">Queued at {new Date(receipt.createdAtLocal).toLocaleString()}</p>
      <button
        type="button"
        onClick={onNewSale}
        className="w-full rounded-md bg-marine px-3 py-2 text-paper transition-opacity hover:opacity-90"
      >
        Start new sale
      </button>
    </div>
  )
}
