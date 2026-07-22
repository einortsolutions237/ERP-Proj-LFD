import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import AttendanceWidget from '@/components/attendance/AttendanceWidget'
import DashboardCard from '@/components/dashboard/DashboardCard'
import RevenueTrendChart from '@/components/dashboard/RevenueTrendChart'
import LowStockWidget from '@/components/dashboard/LowStockWidget'
import PendingDeliveriesWidget from '@/components/dashboard/PendingDeliveriesWidget'
import RecentActivityWidget from '@/components/dashboard/RecentActivityWidget'
import UpcomingAppointmentsWidget from '@/components/dashboard/UpcomingAppointmentsWidget'
import PendingLabOrdersWidget from '@/components/dashboard/PendingLabOrdersWidget'
import PendingLeaveApprovalsWidget from '@/components/dashboard/PendingLeaveApprovalsWidget'
import { buildRevenueTrend } from '@/lib/dashboard/revenueTrend'
import { getDashboardLowStock } from '@/lib/dashboard/lowStockSummary'
import { getDashboardPendingDeliveries } from '@/lib/dashboard/pendingDeliveriesSummary'
import { getRecentActivity } from '@/lib/dashboard/recentActivity'
import { getAppointments } from '@/lib/clinical/getAppointments'
import { getPendingLabOrders } from '@/lib/clinical/getPendingLabOrders'
import { getPendingLeaveApprovals } from '@/lib/dashboard/pendingLeaveApprovals'
import { getBranchName } from '@/lib/branches/getBranchName'
import { ClockIcon, ChartLineIcon, BoxIcon, TruckIcon, ActivityIcon, CalendarCheckIcon, FlaskIcon, ClipboardCheckIcon } from '@/components/dashboard/icons'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const { error } = await searchParams

  const canViewRevenue = hasCapability(user.role, 'reports.sales.view')
  const canViewLowStock = hasCapability(user.role, 'inventory.stock.view')
  const canViewDeliveries = hasCapability(user.role, 'pos.delivery.fulfill')
  const canViewActivity = hasCapability(user.role, 'dashboard.activity.view')
  const canViewAppointments = hasCapability(user.role, 'clinical.appointments.manage')
  const canViewLabOrders = hasCapability(user.role, 'clinical.lab.results.enter')
  const canViewLeaveApprovals = hasCapability(user.role, 'hr.leave.approve')

  const [revenueTrend, lowStock, deliveries, activity, appointments, labOrders, leaveApprovals, branchName] = await Promise.all([
    canViewRevenue ? buildRevenueTrend(user) : Promise.resolve(null),
    canViewLowStock ? getDashboardLowStock(user) : Promise.resolve(null),
    canViewDeliveries ? getDashboardPendingDeliveries(user) : Promise.resolve(null),
    canViewActivity ? getRecentActivity(user) : Promise.resolve(null),
    canViewAppointments ? getAppointments({ upcomingOnly: true }, user) : Promise.resolve(null),
    canViewLabOrders ? getPendingLabOrders(user) : Promise.resolve(null),
    canViewLeaveApprovals ? getPendingLeaveApprovals(user) : Promise.resolve(null),
    getBranchName(user.branchId),
  ])

  return (
    <div className="max-w-5xl space-y-6">
      {error === 'not-authorized' && (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          You don't have permission to view that page.
        </div>
      )}
      <div>
        <h1 className="text-xl font-semibold text-ink">Welcome, {user.email}</h1>
        <p className="text-sm text-slate">
          Role: <span className="font-medium text-ink">{user.role}</span> &middot; Branch:{' '}
          <span className="font-medium text-ink">{branchName}</span>
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
        <DashboardCard title="Check In" icon={ClockIcon} tone="marine">
          <AttendanceWidget />
        </DashboardCard>
        {canViewRevenue && revenueTrend && (
          <DashboardCard title="Revenue — last 30 days" icon={ChartLineIcon} tone="marine">
            <RevenueTrendChart data={revenueTrend} />
          </DashboardCard>
        )}
        {canViewLowStock && lowStock && (
          <DashboardCard title="Low stock" icon={BoxIcon} tone="danger">
            <LowStockWidget summary={lowStock} />
          </DashboardCard>
        )}
        {canViewDeliveries && deliveries && (
          <DashboardCard title="Pending deliveries" icon={TruckIcon} tone="brass">
            <PendingDeliveriesWidget summary={deliveries} />
          </DashboardCard>
        )}
        {canViewActivity && activity && (
          <DashboardCard title="Recent activity" icon={ActivityIcon} tone="marine">
            <RecentActivityWidget items={activity} />
          </DashboardCard>
        )}
        {canViewAppointments && appointments && (
          <DashboardCard title="Upcoming appointments" icon={CalendarCheckIcon} tone="info">
            <UpcomingAppointmentsWidget appointments={appointments} />
          </DashboardCard>
        )}
        {canViewLabOrders && labOrders && (
          <DashboardCard title="Pending lab orders" icon={FlaskIcon} tone="warning">
            <PendingLabOrdersWidget orders={labOrders} />
          </DashboardCard>
        )}
        {canViewLeaveApprovals && leaveApprovals && (
          <DashboardCard title="Pending leave approvals" icon={ClipboardCheckIcon} tone="warning">
            <PendingLeaveApprovalsWidget requests={leaveApprovals} />
          </DashboardCard>
        )}
      </div>
    </div>
  )
}
