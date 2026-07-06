import { listQueuedSales, updateQueuedSale, pruneSyncedEntries, type QueuedSale } from './offlineQueue'

let syncing = false

export function isSyncing(): boolean {
  return syncing
}

// Replays queued sales through POST /api/sales, one at a time, in the
// order they were created. Two distinct failure classes, per this phase's
// Decision #2:
//   - fetch() itself throws (no response reached the client at all) — the
//     network is genuinely still down. Every remaining item would fail
//     identically right now, so this pass stops here; the item is reset to
//     'queued' and the next 'online' event or periodic tick retries from
//     the same point, in the same order.
//   - fetch() resolves with a non-2xx status — the server was reached and
//     gave a definitive answer (most commonly the backorder-without-
//     customer 409). That one entry becomes 'needs_attention' and the loop
//     continues to the next queued item — a rejection must not block the
//     rest of the queue.
export async function runSync(): Promise<void> {
  if (syncing) return
  syncing = true
  try {
    await pruneSyncedEntries()
    const all = await listQueuedSales()
    const toSync = all.filter((s: QueuedSale) => s.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)

    for (const item of toSync) {
      await updateQueuedSale(item.idempotencyKey, { status: 'syncing' })

      let res: Response
      try {
        res = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...item.payload, clientIdempotencyKey: item.idempotencyKey }),
        })
      } catch {
        await updateQueuedSale(item.idempotencyKey, { status: 'queued' })
        break
      }

      if (res.ok) {
        const body = await res.json().catch(() => null)
        if (!body || !body.id) {
          await updateQueuedSale(item.idempotencyKey, {
            status: 'needs_attention',
            lastError: 'Server accepted the sale but returned an unreadable response',
          })
          continue
        }
        await updateQueuedSale(item.idempotencyKey, { status: 'synced', serverSaleId: body.id })
      } else {
        const body = await res.json().catch(() => ({}))
        await updateQueuedSale(item.idempotencyKey, {
          status: 'needs_attention',
          lastError: body.error ?? `Server rejected the sale (HTTP ${res.status})`,
        })
      }
    }
  } finally {
    syncing = false
  }
}

// Called after a user attaches a customer to a needs_attention sale — puts
// it back at the front of the normal queue (status 'queued') with the
// customerId now set, then immediately attempts a sync.
export async function resolveNeedsAttention(idempotencyKey: string, customerId: string): Promise<void> {
  const all = await listQueuedSales()
  const item = all.find((s) => s.idempotencyKey === idempotencyKey)
  if (!item) return
  await updateQueuedSale(idempotencyKey, {
    payload: { ...item.payload, customerId },
    status: 'queued',
    lastError: null,
  })
  await runSync()
}
