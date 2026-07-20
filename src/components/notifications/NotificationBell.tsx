'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationType } from '@/lib/types/notification'

interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  relatedId: string
  read: boolean
  createdAt: string
}

const NOTIFICATION_LINKS: Record<NotificationType, (relatedId: string) => string> = {
  low_stock: (relatedId) => `/products/${relatedId}`,
  leave_request_submitted: () => '/leave/review',
  leave_request_reviewed: () => '/leave',
  appointment_scheduled: () => '/appointments',
  lab_result_entered: (relatedId) => `/customers/${relatedId}`,
  pending_delivery: (relatedId) => `/customers/${relatedId}`,
  message_received: (relatedId) => `/messages/${relatedId}`,
}

// Hand-authored, no icon package — matches Sidebar.tsx's own convention.
function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 10a6 6 0 0 1 12 0v4l1.5 3h-15L6 14z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  )
}

export default function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)

  async function fetchNotifications() {
    const res = await fetch('/api/notifications')
    if (!res.ok) return
    const body = await res.json()
    setNotifications(body)
    setLoaded(true)
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next) fetchNotifications()
  }

  async function handleSelect(notification: NotificationItem) {
    if (!notification.read) {
      await fetch(`/api/notifications/${notification.id}`, { method: 'PATCH' })
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)))
    }
    setOpen(false)
    router.push(NOTIFICATION_LINKS[notification.type](notification.relatedId))
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-mist text-ink transition-colors duration-200 hover:bg-mist"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.1rem] rounded-full bg-danger px-1 text-center text-xs text-paper">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          {!loaded ? (
            <p className="p-3 text-sm text-slate">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="p-3 text-sm text-slate">No notifications.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleSelect(n)}
                className={`block w-full min-h-11 border-b border-mist p-3 text-left text-sm transition-colors duration-200 hover:bg-mist/40 ${n.read ? '' : 'bg-marine/5 font-medium'}`}
              >
                <div className="text-ink">{n.title}</div>
                <div className="text-xs text-slate">{n.body}</div>
                <div className="font-mono text-xs text-slate">{new Date(n.createdAt).toLocaleString()}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
