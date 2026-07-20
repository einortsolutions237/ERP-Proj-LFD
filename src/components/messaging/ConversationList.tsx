'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ConversationListItem {
  peerUid: string
  peerName: string
  peerRole: string
  lastMessageAt: string | null
  canReply: boolean
}

const POLL_INTERVAL_MS = 15000

// Display-only — humanizes the raw role enum ("branch_manager" ->
// "Branch Manager"); never used for any access decision.
function humanizeRole(role: string): string {
  return role
    .split('_')
    .map((word) => (word === 'hr' || word === 'it' ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

export default function ConversationList() {
  const [items, setItems] = useState<ConversationListItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/messaging/conversations')
      if (!res.ok || cancelled) return
      const body = await res.json()
      setItems(body)
      setLoaded(true)
    }
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Most recently active conversation first; conversations with no messages
  // yet (lastMessageAt: null) sort after ones that do.
  const sorted = [...items].sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0
    if (!a.lastMessageAt) return 1
    if (!b.lastMessageAt) return -1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })

  const itSupport = sorted.filter((item) => item.peerRole === 'it_admin')
  const everyoneElse = sorted.filter((item) => item.peerRole !== 'it_admin')

  if (!loaded) return <p className="text-sm text-slate">Loading contacts…</p>

  function renderGroup(label: string, group: ConversationListItem[]) {
    if (group.length === 0) return null
    return (
      <div className="space-y-2">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate">{label}</h2>
        <ul className="divide-y divide-mist overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          {group.map((item) => (
            <li key={item.peerUid}>
              <Link
                href={`/messages/${item.peerUid}`}
                className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm transition-colors duration-200 hover:bg-marine/5"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink">{item.peerName}</span>{' '}
                  <span className="text-slate">({humanizeRole(item.peerRole)})</span>
                  {!item.canReply && <span className="ml-2 text-xs text-danger">no longer available</span>}
                </span>
                {item.lastMessageAt && (
                  <span className="shrink-0 font-mono text-xs text-slate">{formatRelativeTime(item.lastMessageAt)}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {renderGroup('IT Support', itSupport)}
      {renderGroup('Contacts', everyoneElse)}
      {items.length === 0 && <p className="text-sm text-slate">No one is reachable from your role yet.</p>}
    </div>
  )
}
