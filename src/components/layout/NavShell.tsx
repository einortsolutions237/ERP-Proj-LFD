'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import type { SessionUser } from '@/lib/auth/server-guard'
import NotificationBell from '@/components/notifications/NotificationBell'
import QueueStatusIndicator from '@/components/pos/QueueStatusIndicator'

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

// Display-only — humanizes the raw role enum ("branch_manager" ->
// "Branch Manager"); never used for any access decision.
function humanizeRole(role: string): string {
  return role
    .split('_')
    .map((word) => (word === 'hr' || word === 'it' ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

export default function NavShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex flex-1 min-h-full">
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-marine px-3 py-2 text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      {/* Desktop/tablet: sidebar is always visible, no toggle needed. Icon
          + label at lg+, icon-only (tooltip via title attribute) at md-lg. */}
      <div className="hidden md:block print:hidden">
        <Sidebar role={user.role} variant="persistent" />
      </div>

      {/* Mobile: sidebar becomes a dismissible drawer over a backdrop */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="relative z-50 shadow-[var(--shadow-card)]" onClick={() => setMobileNavOpen(false)}>
            <Sidebar role={user.role} variant="drawer" />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between gap-2 border-b border-mist bg-surface px-4 md:px-6 py-3.5 sticky top-0 z-30 print:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="md:hidden rounded-lg border border-mist px-3 py-1.5 text-sm text-ink transition-colors duration-200 hover:bg-mist"
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
          >
            <HamburgerIcon className="h-4 w-4" />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm text-slate">
            {user.email} &middot; <span className="font-medium text-ink">{humanizeRole(user.role)}</span>
          </span>
          {(user.role === 'cashier' || user.role === 'branch_manager') && <QueueStatusIndicator />}
          <NotificationBell />
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-lg border border-mist px-3 py-1.5 text-sm font-medium text-ink transition-colors duration-200 hover:border-marine hover:bg-marine hover:text-paper"
          >
            Sign out
          </button>
        </header>
        {/* overflow-x-auto lets wide tables scroll within the content area
            instead of forcing the whole page wider than the viewport. */}
        <main id="main-content" className="flex-1 overflow-x-auto bg-paper p-4 md:p-6 print:overflow-visible print:bg-white print:p-0">{children}</main>
      </div>
    </div>
  )
}
