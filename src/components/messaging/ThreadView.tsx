'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ThreadMessage {
  id: string
  senderUid: string
  body: string
  createdAt: string
}

interface ThreadResponse {
  peer: { uid: string; name: string; role: string }
  canReply: boolean
  messages: ThreadMessage[]
}

const POLL_INTERVAL_MS = 8000

// Display-only — humanizes the raw role enum; never used for any access
// decision. Duplicated locally rather than shared, matching this codebase's
// own convention of small per-file display helpers.
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

export default function ThreadView({ peerUid, ownUid }: { peerUid: string; ownUid: string }) {
  const [thread, setThread] = useState<ThreadResponse | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  async function load() {
    const res = await fetch(`/api/messaging/messages?peerUid=${encodeURIComponent(peerUid)}`)
    if (res.status === 404) {
      setNotFound(true)
      return
    }
    if (!res.ok) return
    setThread(await res.json())
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peerUid])

  async function handleSend() {
    if (sending) return
    if (!draft.trim()) return
    setSending(true)
    setError(null)
    const res = await fetch('/api/messaging/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peerUid, body: draft.trim() }),
    })
    setSending(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to send message.')
      return
    }
    setDraft('')
    await load()
  }

  if (notFound) return <p className="text-sm text-slate">This contact is not reachable.</p>
  if (!thread) return <p className="text-sm text-slate">Loading conversation…</p>

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <Link
          href="/messages"
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-marine transition-colors duration-200 hover:bg-mist hover:underline"
        >
          ← Messages
        </Link>
        <h1 className="font-display text-lg font-semibold text-ink">
          {thread.peer.name} <span className="text-sm font-normal text-slate">({humanizeRole(thread.peer.role)})</span>
        </h1>
      </div>

      <div
        className="flex-1 space-y-2 overflow-y-auto rounded-2xl border border-mist bg-surface p-4 shadow-[var(--shadow-card)]"
        aria-live="polite"
      >
        {thread.messages.length === 0 && <p className="text-sm text-slate">No messages yet.</p>}
        {thread.messages.map((m) => (
          <div key={m.id} className={m.senderUid === ownUid ? 'text-right' : 'text-left'}>
            <div
              className={
                m.senderUid === ownUid
                  ? 'inline-block max-w-[75%] whitespace-pre-wrap break-words rounded-lg bg-marine px-3 py-2 text-left text-sm text-paper'
                  : 'inline-block max-w-[75%] whitespace-pre-wrap break-words rounded-lg bg-mist px-3 py-2 text-left text-sm text-ink'
              }
            >
              {m.body}
            </div>
            <div className="font-mono text-xs text-slate">{formatRelativeTime(m.createdAt)}</div>
          </div>
        ))}
      </div>

      {thread.canReply ? (
        <div className="space-y-2">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <label htmlFor="message-draft" className="sr-only">
              Message
            </label>
            <input
              id="message-draft"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              className="min-h-11 flex-1 rounded-lg border border-mist px-3 py-2 text-sm focus:border-marine"
              disabled={sending}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="min-h-11 rounded-lg bg-marine px-4 text-sm font-medium text-paper transition-opacity duration-200 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-danger">
          This conversation is no longer available — a participant&apos;s role or branch has changed.
        </p>
      )}
    </div>
  )
}
