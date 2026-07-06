import { dbGetAll, dbPut, dbDelete, QUEUE_STORE } from './offlineDb'

export type QueuedSaleStatus = 'queued' | 'syncing' | 'synced' | 'needs_attention'

export interface QueuedSalePayload {
  lineItems: { type: 'product' | 'service'; itemId: string; quantity: number }[]
  discountAmount: number
  payments: { method: 'cash' | 'mtn_momo' | 'orange_money'; amount: number; reference: string | null }[]
  customerId: string | null
}

export interface QueuedSaleReceiptLine {
  type: 'product' | 'service'
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

export interface QueuedSaleReceipt {
  lineItems: QueuedSaleReceiptLine[]
  subtotal: number
  total: number
  payments: QueuedSalePayload['payments']
  createdAtLocal: number
}

export interface QueuedSale {
  idempotencyKey: string
  payload: QueuedSalePayload
  receiptSnapshot: QueuedSaleReceipt
  status: QueuedSaleStatus
  lastError: string | null
  serverSaleId: string | null
  createdAt: number
}

export async function enqueueSale(sale: QueuedSale): Promise<void> {
  await dbPut(QUEUE_STORE, sale)
}

export async function listQueuedSales(): Promise<QueuedSale[]> {
  return dbGetAll<QueuedSale>(QUEUE_STORE)
}

export async function updateQueuedSale(idempotencyKey: string, patch: Partial<QueuedSale>): Promise<void> {
  const all = await listQueuedSales()
  const existing = all.find((s) => s.idempotencyKey === idempotencyKey)
  if (!existing) return
  await dbPut(QUEUE_STORE, { ...existing, ...patch })
}

export async function deleteQueuedSale(idempotencyKey: string): Promise<void> {
  await dbDelete(QUEUE_STORE, idempotencyKey)
}

// Light housekeeping: a 'synced' entry is kept briefly so the UI can show
// recent activity, then cleared automatically the next time the queue is
// listed for display — see Decision #7.
const SYNCED_RETENTION_MS = 60_000

export async function pruneSyncedEntries(): Promise<void> {
  const all = await listQueuedSales()
  const now = Date.now()
  for (const item of all) {
    if (item.status === 'synced' && now - item.createdAt > SYNCED_RETENTION_MS) {
      await deleteQueuedSale(item.idempotencyKey)
    }
  }
}
