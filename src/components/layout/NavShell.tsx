'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import type { SessionUser } from '@/lib/auth/server-guard'
import NotificationBell from '@/components/notifications/NotificationBell'

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
      {/* Desktop: sidebar is always visible, no toggle needed */}
      <div className="hidden md:block">
        <Sidebar role={user.role} />
      </div>

      {/* Mobile: sidebar becomes a dismissible drawer over a backdrop */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="relative z-50" onClick={() => setMobileNavOpen(false)}>
            <Sidebar role={user.role} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between gap-2 border-b px-4 md:px-6 py-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="md:hidden rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
          >
            ☰
          </button>
          <span className="text-sm text-zinc-600 truncate">
            {user.email} &middot; <span className="font-medium">{user.role}</span>
          </span>
          <NotificationBell />
          <button
            onClick={handleLogout}
            className="shrink-0 rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
          >
            Sign out
          </button>
        </header>
        {/* overflow-x-auto lets wide tables scroll within the content area
            instead of forcing the whole page wider than the viewport. */}
        <main className="flex-1 overflow-x-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
