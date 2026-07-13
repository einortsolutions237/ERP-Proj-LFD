import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import AttendanceWidget from '@/components/attendance/AttendanceWidget'
import DashboardCard from '@/components/dashboard/DashboardCard'
import RevenueTrendChart from '@/components/dashboard/RevenueTrendChart'
import LowStockWidget from '@/components/dashboard/LowStockWidget'
import PendingDeliveriesWidget from '@/components/dashboard/PendingDeliveriesWidget'
import RecentActivityWidget from '@/components/dashboard/RecentActivityWidget'
import { buildRevenueTrend } from '@/lib/dashboard/revenueTrend'
import { getDashboardLowStock } from '@/lib/dashboard/lowStockSummary'
import { getDashboardPendingDeliveries } from '@/lib/dashboard/pendingDeliveriesSummary'
import { getRecentActivity } from '@/lib/dashboard/recentActivity'

export default async function DashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const canViewRevenue = hasCapability(user.role, 'reports.sales.view')
  const canViewLowStock = hasCapability(user.role, 'inventory.stock.view')
  const canViewDeliveries = hasCapability(user.role, 'pos.delivery.fulfill')
  const canViewActivity = hasCapability(user.role, 'dashboard.activity.view')

  const [revenueTrend, lowStock, deliveries, activity] = await Promise.all([
    canViewRevenue ? buildRevenueTrend(user) : Promise.resolve(null),
    canViewLowStock ? getDashboardLowStock(user) : Promise.resolve(null),
    canViewDeliveries ? getDashboardPendingDeliveries(user) : Promise.resolve(null),
    canViewActivity ? getRecentActivity(user) : Promise.resolve(null),
  ])

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Welcome, {user.email}</h1>
        <p className="text-sm text-slate">
          Role: <span className="font-medium text-ink">{user.role}</span> &middot; Branch:{' '}
          <span className="font-medium text-ink">{user.branchId}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DashboardCard title="Check In">
          <AttendanceWidget />
        </DashboardCard>
        {canViewRevenue && revenueTrend && (
          <DashboardCard title="Revenue — last 30 days">
            <RevenueTrendChart data={revenueTrend} />
          </DashboardCard>
        )}
        {canViewLowStock && lowStock && (
          <DashboardCard title="Low stock">
            <LowStockWidget summary={lowStock} />
          </DashboardCard>
        )}
        {canViewDeliveries && deliveries && (
          <DashboardCard title="Pending deliveries">
            <PendingDeliveriesWidget summary={deliveries} />
          </DashboardCard>
        )}
        {canViewActivity && activity && (
          <DashboardCard title="Recent activity">
            <RecentActivityWidget items={activity} />
          </DashboardCard>
        )}
      </div>
    </div>
  )
}
