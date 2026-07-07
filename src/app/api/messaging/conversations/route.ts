import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { canMessage, type MessagingParty } from '@/lib/messaging/canMessage'
import type { RoleId } from '@/lib/auth/permissions'

interface ConversationListItem {
  peerUid: string
  peerName: string
  peerRole: RoleId
  lastMessageAt: string | null
  canReply: boolean
}

export async function GET() {
  try {
    const user = await requireCapability('messaging.access')
    const sender: MessagingParty = { uid: user.uid, role: user.role, branchId: user.branchId }
    const db = getAdminFirestore()

    const staffSnap = await db.collection('staff').get()
    const candidates = staffSnap.docs
      .filter((d) => d.id !== user.uid)
      .map((d) => {
        const data = d.data()
        return { uid: d.id, role: data.role as RoleId, branchId: data.branchId as string, name: data.name as string }
      })

    const convSnap = await db.collection('conversations').where('participantUids', 'array-contains', user.uid).get()
    const conversationByPeer = new Map<string, string | null>()
    for (const doc of convSnap.docs) {
      const data = doc.data()
      const participantUids = data.participantUids as string[]
      const peerUid = participantUids.find((uid) => uid !== user.uid)
      if (!peerUid) continue
      const lastMessageAt = data.lastMessageAt as FirebaseFirestore.Timestamp | undefined
      conversationByPeer.set(peerUid, lastMessageAt ? lastMessageAt.toDate().toISOString() : null)
    }

    const items: ConversationListItem[] = candidates
      .map((c) => {
        const hasConversation = conversationByPeer.has(c.uid)
        const isReachable = canMessage(sender, { uid: c.uid, role: c.role, branchId: c.branchId })
        if (!hasConversation && !isReachable) return null
        return {
          peerUid: c.uid,
          peerName: c.name,
          peerRole: c.role,
          lastMessageAt: conversationByPeer.get(c.uid) ?? null,
          canReply: isReachable,
        }
      })
      .filter((item): item is ConversationListItem => item !== null)
      .sort((a, b) => {
        if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.localeCompare(a.lastMessageAt)
        if (a.lastMessageAt) return -1
        if (b.lastMessageAt) return 1
        return a.peerName.localeCompare(b.peerName)
      })

    return NextResponse.json(items)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
