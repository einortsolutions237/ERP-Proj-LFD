'use client'
import { useEffect, useRef, useState } from 'react'
import { listQueuedSales, type QueuedSale } from '@/lib/pos/offlineQueue'
import { runSync, resolveNeedsAttention } from '@/lib/pos/syncQueue'

const POLL_INTERVAL_MS = 3000
const SYNC_INTERVAL_MS = 20000

interface CustomerOption {
  id: string
  name: string
  phone: string
}

const BACKORDER_NEEDS_CUSTOMER_ERROR = 'A sale with a backordered item must have a customer attached'

function friendlyQueueError(lastError: string | null): string {
  if (lastError === BACKORDER_NEEDS_CUSTOMER_ERROR) {
    return 'This sale needs a customer attached — search or add one below.'
  }
  return lastError ?? 'This sale could not be synced.'
}

export default function QueueStatusIndicator() {
  const [queue, setQueue] = useState<QueuedSale[]>([])
  const [open, setOpen] = useState(false)
  const [customers, setCustomers] = useState<CustomerOption[] | null>(null)
  const [attachingKey, setAttachingKey] = useState<string | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const all = await listQueuedSales()
      if (!cancelled) setQueue(all)
    }
    refresh()
    const pollId = setInterval(refresh, POLL_INTERVAL_MS)

    runSync()
    const onOnline = () => runSync()
    window.addEventListener('online', onOnline)
    const syncId = setInterval(() => {
      if (navigator.onLine) runSync()
    }, SYNC_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(pollId)
      clearInterval(syncId)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  const queuedCount = queue.filter((s) => s.status === 'queued' || s.status === 'syncing').length
  const needsAttention = queue.filter((s) => s.status === 'needs_attention')
  const syncingNow = queue.some((s) => s.status === 'syncing')

  async function loadCustomersIfNeeded() {
    if (customers) return
    const res = await fetch('/api/customers')
    if (!res.ok) return
    const body = await res.json()
    setCustomers(body.map((c: { id: string; name: string; phone: string }) => ({ id: c.id, name: c.name, phone: c.phone })))
  }

  async function handleAttach(idempotencyKey: string, customerId: string) {
    await resolveNeedsAttention(idempotencyKey, customerId)
    setAttachingKey(null)
    const all = await listQueuedSales()
    setQueue(all)
  }

  if (queuedCount === 0 && needsAttention.length === 0) return null

  const filteredCustomers = (customers ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(customerQuery.trim().toLowerCase()) ||
      c.phone.toLowerCase().includes(customerQuery.trim().toLowerCase())
  )

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative min-h-11 rounded-lg border border-mist px-3 text-sm text-ink transition-colors duration-200 hover:bg-mist"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {syncingNow ? 'Syncing…' : `Queue: ${queuedCount}`}
        {needsAttention.length > 0 && (
          <span className="ml-1 rounded-full bg-danger px-1.5 py-0.5 text-xs text-paper">{needsAttention.length}</span>
        )}
      </button>
      {open && (
        <div
          className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto rounded-2xl border border-mist bg-paper p-3 shadow-[var(--shadow-card)]"
        >
          {queue.length === 0 && <p className="text-sm text-slate">No queued sales.</p>}
          {queue.map((item) => (
            <div key={item.idempotencyKey} className="space-y-1 border-b border-mist py-2 text-sm last:border-0">
              <div className="flex justify-between">
                <span className="text-ink">{item.receiptSnapshot.total.toFixed(2)} FCFA</span>
                <span className="text-slate">{item.status}</span>
              </div>
              {item.status === 'needs_attention' && (
                <div className="space-y-1">
                  <p role="alert" className="text-xs text-danger">
                    {friendlyQueueError(item.lastError)}
                  </p>
                  {attachingKey === item.idempotencyKey ? (
                    <div className="space-y-1">
                      <label htmlFor={`queue-attach-search-${item.idempotencyKey}`} className="sr-only">
                        Search customer by name or phone
                      </label>
                      <input
                        id={`queue-attach-search-${item.idempotencyKey}`}
                        value={customerQuery}
                        onChange={(e) => setCustomerQuery(e.target.value)}
                        onFocus={loadCustomersIfNeeded}
                        placeholder="Search customer…"
                        className="w-full rounded-lg border border-mist px-2 py-1 text-xs"
                      />
                      <div className="max-h-24 overflow-y-auto">
                        {filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleAttach(item.idempotencyKey, c.id)}
                            className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-mist"
                            title={`${c.name} — ${c.phone}`}
                          >
                            {c.name} — {c.phone}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAttachingKey(item.idempotencyKey)
                        loadCustomersIfNeeded()
                      }}
                      className="rounded-lg border border-mist px-2 py-1 text-xs text-ink hover:bg-mist"
                    >
                      Attach customer &amp; retry
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
