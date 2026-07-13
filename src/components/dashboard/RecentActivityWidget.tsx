import type { RecentActivityItem } from '@/lib/dashboard/recentActivity'

const ACTION_LABELS: Partial<Record<RecentActivityItem['action'], string>> = {
  sale_create: 'New sale',
  sale_void: 'Sale voided',
  stock_adjust: 'Stock adjusted',
  stock_transfer: 'Stock transferred',
  pending_delivery_fulfilled: 'Delivery fulfilled',
  staff_create: 'Staff account created',
  staff_edit: 'Staff record edited',
  staff_delete: 'Staff account removed',
  permission_change: 'Role changed',
  product_create: 'Product added',
  product_edit: 'Product edited',
  product_delete: 'Product removed',
  service_create: 'Service added',
  service_edit: 'Service edited',
  service_delete: 'Service removed',
  supplier_create: 'Supplier added',
  supplier_edit: 'Supplier edited',
  supplier_delete: 'Supplier removed',
  customer_create: 'Customer added',
  customer_edit: 'Customer edited',
  customer_delete: 'Customer removed',
  leave_request_create: 'Leave requested',
}

export default function RecentActivityWidget({ items }: { items: RecentActivityItem[] }) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-slate">No recent activity.</p>
      ) : (
        <ul className="divide-y divide-mist">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink">
                {ACTION_LABELS[item.action] ?? item.action}
                {item.actorEmail && <span className="ml-2 text-xs text-slate">{item.actorEmail}</span>}
              </span>
              <span className="font-mono text-xs text-slate">{new Date(item.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
