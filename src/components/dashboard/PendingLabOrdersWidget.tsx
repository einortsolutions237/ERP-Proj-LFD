import type { PendingLabOrderRow } from '@/lib/clinical/getPendingLabOrders'

export default function PendingLabOrdersWidget({ orders }: { orders: PendingLabOrderRow[] }) {
  return (
    <div className="space-y-3">
      {orders.length === 0 ? (
        <p className="text-sm text-slate">No pending lab orders.</p>
      ) : (
        <>
          <p className="text-sm text-slate">
            <span className="font-mono text-base font-medium text-warning">{orders.length}</span>{' '}
            {orders.length === 1 ? 'order' : 'orders'} awaiting results
          </p>
          <ul className="divide-y divide-mist">
            {orders.slice(0, 5).map((order) => (
              <li key={order.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">
                  {order.testName}
                  <span className="ml-2 text-xs text-slate">{order.customerName}</span>
                </span>
                <span className="font-mono text-xs text-slate">{new Date(order.orderedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
