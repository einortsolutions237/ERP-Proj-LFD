import Link from 'next/link'
import type { ReactElement } from 'react'
import { hasCapability, type Capability, type RoleId } from '@/lib/auth/permissions'

interface IconProps {
  className?: string
}

type IconComponent = (props: IconProps) => ReactElement

// Minimal hand-authored line icons (no icon package dependency). Purely a
// wayfinding aid for the collapsed tablet sidebar — single-color via
// currentColor so they inherit the surrounding text color automatically.
const ICON_SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const HomeIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v10h5v-6h2v6h5V10" />
  </svg>
)

const UserIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <circle cx="12" cy="8" r="3.25" />
    <path d="M5.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" />
  </svg>
)

const BadgeIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M12 3.5 18 6v5c0 5-2.6 8-6 9.5-3.4-1.5-6-4.5-6-9.5V6z" />
    <path d="M9.5 12l1.8 1.8L14.5 10" />
  </svg>
)

const GridIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="4" y="4" width="7" height="7" rx="1" />
    <rect x="13" y="4" width="7" height="7" rx="1" />
    <rect x="4" y="13" width="7" height="7" rx="1" />
    <rect x="13" y="13" width="7" height="7" rx="1" />
  </svg>
)

const PinIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M12 21c4-4.5 7-8 7-12a7 7 0 10-14 0c0 4 3 7.5 7 12z" />
    <circle cx="12" cy="9" r="2.25" />
  </svg>
)

const GearIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" />
  </svg>
)

const DocListIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="5" y="3" width="14" height="18" rx="1" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
)

const BoxIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 8 12 4l8 4-8 4-8-4z" />
    <path d="M4 8v8l8 4 8-4V8" />
    <path d="M12 12v8" />
  </svg>
)

const WrenchIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M15.5 6.5a3.5 3.5 0 11-4.9 4.9L5 17l2 2 5.6-5.6a3.5 3.5 0 004.9-4.9l-2 2-2-2 2-2z" />
  </svg>
)

const TruckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="2" y="8" width="11" height="8" />
    <path d="M13 11h4l3 3v2h-7z" />
    <circle cx="6.5" cy="18" r="1.5" />
    <circle cx="16.5" cy="18" r="1.5" />
  </svg>
)

const LayersIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="4" y="10" width="7" height="7" rx="1" />
    <rect x="13" y="6" width="7" height="7" rx="1" />
  </svg>
)

const CartIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M3 4h2l2.2 12a2 2 0 002 1.7h8a2 2 0 002-1.7L21 8H6.2" />
    <circle cx="9.5" cy="20" r="1.2" />
    <circle cx="17.5" cy="20" r="1.2" />
  </svg>
)

const ReceiptIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
)

const PeopleIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <circle cx="9" cy="9" r="3" />
    <path d="M3.5 20c.4-3.6 2.6-5.5 5.5-5.5s5.1 1.9 5.5 5.5" />
    <circle cx="17.5" cy="9.5" r="2.25" />
    <path d="M15.8 14.3c2.6.4 4.1 2.1 4.4 4.7" />
  </svg>
)

const CalendarIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="4" y="5" width="16" height="15" rx="1" />
    <path d="M4 10h16M8 3v3M16 3v3" />
  </svg>
)

const CalendarCheckIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="4" y="5" width="16" height="15" rx="1" />
    <path d="M4 10h16M8 3v3M16 3v3" />
    <path d="M9 14.5 11 16.5 15.5 12" />
  </svg>
)

const ClockIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

const BarChartIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 20V4M4 20h16" />
    <rect x="7" y="13" width="3" height="7" />
    <rect x="12" y="9" width="3" height="11" />
    <rect x="17" y="5" width="3" height="15" />
  </svg>
)

const ChartLineIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 20V4M4 20h16" />
    <path d="M6 15l3.5-4 3 2.5L18 7" />
    <circle cx="6" cy="15" r="0.9" />
    <circle cx="9.5" cy="11" r="0.9" />
    <circle cx="12.5" cy="13.5" r="0.9" />
    <circle cx="18" cy="7" r="0.9" />
  </svg>
)

const StethoscopeIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M6 4v6a4 4 0 008 0V4" />
    <path d="M10 14v2a4 4 0 004 4 4 4 0 004-4v-1" />
    <circle cx="18" cy="9" r="1.5" />
  </svg>
)

const MegaphoneIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M3 10v4h3l7 4V6l-7 4H3z" />
    <path d="M15 8.5a3.5 3.5 0 010 7M17.5 6a6.5 6.5 0 010 12" />
  </svg>
)

const ChatIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
  </svg>
)

const ClipboardIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <rect x="6" y="4" width="12" height="17" rx="1" />
    <rect x="9" y="2.5" width="6" height="3" rx="1" />
    <path d="M9 11h6M9 15h6" />
  </svg>
)

const FlaskIcon: IconComponent = ({ className }) => (
  <svg {...ICON_SVG_PROPS} className={className}>
    <path d="M9 2.5h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.3h12.4a1.5 1.5 0 0 0 1.3-2.3L14 9.5V3" />
    <path d="M7.5 15h9" />
  </svg>
)

interface NavLink {
  href: string
  label: string
  capability: Capability | Capability[]
  icon: IconComponent
}

const NAV_LINKS: NavLink[] = [
  { href: '/messages', label: 'Messages', capability: 'messaging.access', icon: ChatIcon },
  { href: '/staff', label: 'Staff', capability: 'admin.staff.view', icon: UserIcon },
  { href: '/roles', label: 'Roles', capability: 'admin.roles.view', icon: BadgeIcon },
  { href: '/departments', label: 'Departments', capability: 'admin.departments.manage', icon: GridIcon },
  { href: '/branches', label: 'Branches', capability: 'admin.branches.manage', icon: PinIcon },
  { href: '/settings', label: 'Settings', capability: 'admin.settings.manage', icon: GearIcon },
  { href: '/audit-log', label: 'Audit Log', capability: 'admin.auditLog.view', icon: DocListIcon },
  { href: '/products', label: 'Products', capability: 'inventory.catalog.manage', icon: BoxIcon },
  { href: '/services', label: 'Services', capability: 'inventory.catalog.manage', icon: WrenchIcon },
  { href: '/suppliers', label: 'Suppliers', capability: 'inventory.suppliers.manage', icon: TruckIcon },
  { href: '/stock', label: 'Stock', capability: 'inventory.stock.view', icon: LayersIcon },
  { href: '/pos', label: 'New Sale', capability: 'pos.sale.create', icon: CartIcon },
  { href: '/pos/sales', label: 'Sales Log', capability: 'pos.sale.view', icon: ReceiptIcon },
  { href: '/customers', label: 'Customers', capability: 'crm.customer.view', icon: PeopleIcon },
  { href: '/leave', label: 'My Leave', capability: 'hr.leave.request', icon: CalendarIcon },
  { href: '/leave/review', label: 'Review Leave', capability: 'hr.leave.approve', icon: CalendarCheckIcon },
  { href: '/attendance', label: 'Attendance', capability: 'hr.attendance.view', icon: ClockIcon },
  { href: '/reports/sales', label: 'Sales Report', capability: 'reports.sales.view', icon: BarChartIcon },
  { href: '/reports/inventory', label: 'Stock Report', capability: 'reports.inventory.view', icon: ChartLineIcon },
  { href: '/appointments', label: 'Appointments', capability: 'clinical.appointments.manage', icon: StethoscopeIcon },
  {
    href: '/seminars',
    label: 'Seminars',
    capability: ['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'],
    icon: MegaphoneIcon,
  },
  {
    href: '/intake-questionnaire',
    label: 'Intake Questionnaire',
    capability: 'clinical.questionnaire.manage',
    icon: ClipboardIcon,
  },
  {
    href: '/lab-orders/pending',
    label: 'Pending Lab Orders',
    capability: 'clinical.lab.results.enter',
    icon: FlaskIcon,
  },
]

// 'persistent' = the always-mounted md+ sidebar (icon-only at md, full at
// lg+, handled via responsive classes below). 'drawer' = the mobile
// slide-over rendered by NavShell only below md, which always shows full
// labels since it's already an explicit, deliberately-opened overlay.
export default function Sidebar({ role, variant = 'persistent' }: { role: RoleId; variant?: 'persistent' | 'drawer' }) {
  const isDrawer = variant === 'drawer'

  const navClassName = isDrawer
    ? 'flex h-full w-64 flex-col gap-1 bg-paper p-4'
    : 'flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-mist bg-paper p-2 lg:w-60 lg:items-stretch lg:p-4'

  const sectionLabelClassName = isDrawer
    ? 'px-3 pb-2 pt-1'
    : 'hidden px-3 pb-2 pt-1 lg:block'

  const linkClassName = isDrawer
    ? 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-marine/10 hover:text-marine'
    : 'flex items-center justify-center gap-0 rounded-md px-2 py-2 text-sm font-medium text-ink transition-colors hover:bg-marine/10 hover:text-marine lg:justify-start lg:gap-3 lg:px-3'

  const labelClassName = isDrawer ? 'truncate' : 'hidden truncate lg:inline'
  const iconClassName = 'h-5 w-5 shrink-0'

  return (
    <nav className={navClassName}>
      <div className={sectionLabelClassName}>
        <span className="font-display text-xs font-semibold uppercase tracking-wider text-slate">Menu</span>
      </div>

      <Link href="/dashboard" title="Dashboard" className={linkClassName}>
        <HomeIcon className={iconClassName} />
        <span className={labelClassName}>Dashboard</span>
      </Link>

      {NAV_LINKS.filter((link) =>
        (Array.isArray(link.capability) ? link.capability : [link.capability]).some((c) => hasCapability(role, c))
      ).map((link) => (
        <Link key={link.href} href={link.href} title={link.label} className={linkClassName}>
          <link.icon className={iconClassName} />
          <span className={labelClassName}>{link.label}</span>
        </Link>
      ))}
    </nav>
  )
}
