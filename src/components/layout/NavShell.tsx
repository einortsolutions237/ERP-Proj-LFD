'use client'

import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import type { SessionUser } from '@/lib/auth/server-guard'

export default function NavShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex flex-1 min-h-full">
      <Sidebar role={user.role} />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="text-sm text-zinc-600">
            {user.email} &middot; <span className="font-medium">{user.role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
          >
            Sign out
          </button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
