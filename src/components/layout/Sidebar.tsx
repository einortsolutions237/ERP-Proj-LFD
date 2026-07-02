import Link from 'next/link'
import { hasCapability, type Capability, type RoleId } from '@/lib/auth/permissions'

interface NavLink {
  href: string
  label: string
  capability: Capability
}

const NAV_LINKS: NavLink[] = [
  { href: '/staff', label: 'Staff', capability: 'admin.staff.view' },
  { href: '/roles', label: 'Roles', capability: 'admin.roles.view' },
  { href: '/departments', label: 'Departments', capability: 'admin.departments.manage' },
  { href: '/branches', label: 'Branches', capability: 'admin.branches.manage' },
  { href: '/settings', label: 'Settings', capability: 'admin.settings.manage' },
  { href: '/audit-log', label: 'Audit Log', capability: 'admin.auditLog.view' },
  { href: '/products', label: 'Products', capability: 'inventory.catalog.manage' },
  { href: '/services', label: 'Services', capability: 'inventory.catalog.manage' },
  { href: '/suppliers', label: 'Suppliers', capability: 'inventory.suppliers.manage' },
  { href: '/stock', label: 'Stock', capability: 'inventory.stock.view' },
]

export default function Sidebar({ role }: { role: RoleId }) {
  return (
    <nav className="w-56 shrink-0 border-r bg-zinc-50 p-4 space-y-1">
      <Link
        href="/dashboard"
        className="block rounded px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
      >
        Dashboard
      </Link>
      {NAV_LINKS.filter((link) => hasCapability(role, link.capability)).map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="block rounded px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
