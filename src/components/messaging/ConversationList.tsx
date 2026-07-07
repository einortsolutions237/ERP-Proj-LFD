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

  const itSupport = items.filter((item) => item.peerRole === 'it_admin')
  const everyoneElse = items.filter((item) => item.peerRole !== 'it_admin')

  if (!loaded) return <p className="text-sm text-slate">Loading contacts…</p>

  function renderGroup(label: string, group: ConversationListItem[]) {
    if (group.length === 0) return null
    return (
      <div className="space-y-2">
        <h2 className="font-display text-xs font-semibold uppercase tracking-wider text-slate">{label}</h2>
        <ul className="divide-y divide-mist rounded-md border border-mist">
          {group.map((item) => (
            <li key={item.peerUid}>
              <Link
                href={`/messages/${item.peerUid}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-marine/5"
              >
                <span>
                  <span className="font-medium text-ink">{item.peerName}</span>{' '}
                  <span className="text-slate">({item.peerRole})</span>
                  {!item.canReply && <span className="ml-2 text-xs text-danger">no longer available</span>}
                </span>
                {item.lastMessageAt && (
                  <span className="shrink-0 text-xs text-slate">{new Date(item.lastMessageAt).toLocaleString()}</span>
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
