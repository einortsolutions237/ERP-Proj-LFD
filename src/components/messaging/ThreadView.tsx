'use client'

import { useEffect, useState } from 'react'

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
  if (!thread) return <p className="text-sm text-slate">Loading…</p>

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="font-display text-lg font-semibold text-ink">
        {thread.peer.name} <span className="text-sm font-normal text-slate">({thread.peer.role})</span>
      </h1>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-mist p-4">
        {thread.messages.length === 0 && <p className="text-sm text-slate">No messages yet.</p>}
        {thread.messages.map((m) => (
          <div key={m.id} className={m.senderUid === ownUid ? 'text-right' : 'text-left'}>
            <div
              className={
                m.senderUid === ownUid
                  ? 'inline-block rounded-md bg-marine px-3 py-2 text-sm text-paper'
                  : 'inline-block rounded-md bg-mist px-3 py-2 text-sm text-ink'
              }
            >
              {m.body}
            </div>
            <div className="text-xs text-slate">{new Date(m.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {thread.canReply ? (
        <div className="space-y-2">
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message…"
              className="flex-1 rounded-md border border-mist px-3 py-2 text-sm"
              disabled={sending}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-md bg-marine px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
            >
              Send
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
