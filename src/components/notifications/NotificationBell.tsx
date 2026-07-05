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
}

export default function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)

  async function fetchNotifications() {
    const res = await fetch('/api/notifications')
    if (!res.ok) return
    const body = await res.json()
    setNotifications(body)
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
        className="relative rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
        aria-label="Notifications"
        aria-expanded={open}
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-xs text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-h-96 overflow-y-auto rounded border bg-white shadow-lg">
          {notifications.length === 0 ? (
            <p className="p-3 text-sm text-zinc-500">No notifications.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleSelect(n)}
                className={`block w-full border-b p-3 text-left text-sm hover:bg-zinc-50 ${n.read ? '' : 'bg-zinc-50 font-medium'}`}
              >
                <div>{n.title}</div>
                <div className="text-xs text-zinc-600">{n.body}</div>
                <div className="text-xs text-zinc-400">{new Date(n.createdAt).toLocaleString()}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
