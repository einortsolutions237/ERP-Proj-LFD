import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { canMessage, type MessagingParty } from '@/lib/messaging/canMessage'
import { getMessagingParty } from '@/lib/messaging/getMessagingParty'

const MAX_BODY_LENGTH = 4000

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function conversationIdFor(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_')
}

export async function GET(request: Request) {
  try {
    const user = await requireCapability('messaging.access')
    const { searchParams } = new URL(request.url)
    const peerUid = searchParams.get('peerUid')

    if (!isNonEmptyString(peerUid) || peerUid === user.uid) {
      return NextResponse.json({ error: 'peerUid is required and must not be the caller' }, { status: 400 })
    }

    const peerParty = await getMessagingParty(peerUid)
    if (!peerParty) {
      return NextResponse.json({ error: 'peerUid does not reference an existing staff account' }, { status: 404 })
    }

    const db = getAdminFirestore()
    const sender: MessagingParty = { uid: user.uid, role: user.role, branchId: user.branchId }
    const canReply = canMessage(sender, peerParty)

    const peerStaffSnap = await db.collection('staff').doc(peerUid).get()
    const peerName = (peerStaffSnap.data()?.name as string | undefined) ?? peerUid

    const conversationId = conversationIdFor(user.uid, peerUid)
    const convSnap = await db.collection('conversations').doc(conversationId).get()

    if (!convSnap.exists) {
      if (!canReply) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ peer: { uid: peerUid, name: peerName, role: peerParty.role }, canReply: true, messages: [] })
    }

    const messagesSnap = await db
      .collection('messages')
      .where('conversationId', '==', conversationId)
      .orderBy('createdAt', 'asc')
      .get()

    const unreadFromPeer = messagesSnap.docs.filter((d) => d.data().senderUid !== user.uid && d.data().read === false)
    if (unreadFromPeer.length > 0) {
      const batch = db.batch()
      for (const doc of unreadFromPeer) batch.update(doc.ref, { read: true })
      await batch.commit()
    }

    const messages = messagesSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        senderUid: data.senderUid as string,
        body: data.body as string,
        createdAt: (data.createdAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
      }
    })

    return NextResponse.json({ peer: { uid: peerUid, name: peerName, role: peerParty.role }, canReply, messages })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('messaging.access')
    const body = await request.json()

    if (!isNonEmptyString(body.peerUid) || body.peerUid === user.uid) {
      return NextResponse.json({ error: 'peerUid is required and must not be the caller' }, { status: 400 })
    }
    if (!isNonEmptyString(body.body) || body.body.trim().length > MAX_BODY_LENGTH) {
      return NextResponse.json({ error: `body is required and must be at most ${MAX_BODY_LENGTH} characters` }, { status: 400 })
    }

    const peerUid = body.peerUid as string
    const messageBody = (body.body as string).trim()

    const peerParty = await getMessagingParty(peerUid)
    if (!peerParty) {
      return NextResponse.json({ error: 'peerUid does not reference an existing staff account' }, { status: 404 })
    }

    const db = getAdminFirestore()
    const sender: MessagingParty = { uid: user.uid, role: user.role, branchId: user.branchId }
    const conversationId = conversationIdFor(user.uid, peerUid)
    const convRef = db.collection('conversations').doc(conversationId)
    const existingConvSnap = await convRef.get()

    // Re-evaluated fresh, right now, from live claims fetched above — never
    // from a cached relationship on the conversation doc. This is the one
    // enforcement point that makes a role/branch change close off a
    // conversation that used to be valid: if canMessage is false here, it
    // doesn't matter that the conversation already exists.
    const allowed = canMessage(sender, peerParty)
    if (!allowed) {
      const status = existingConvSnap.exists ? 409 : 403
      const message = existingConvSnap.exists
        ? 'This conversation is no longer available — a participant\'s role or branch has changed.'
        : 'You are not able to message this recipient.'
      return NextResponse.json({ error: message }, { status })
    }

    const [senderStaffSnap, peerStaffSnap] = await Promise.all([
      db.collection('staff').doc(user.uid).get(),
      db.collection('staff').doc(peerUid).get(),
    ])
    const senderName = (senderStaffSnap.data()?.name as string | undefined) ?? user.email
    const peerName = (peerStaffSnap.data()?.name as string | undefined) ?? peerUid

    const msgRef = db.collection('messages').doc()

    await db.runTransaction(async (tx) => {
      const convSnap = await tx.get(convRef)
      const now = new Date()
      const conversationFields = {
        participantUids: [user.uid, peerUid].sort(),
        participantRoles: { [user.uid]: user.role, [peerUid]: peerParty.role },
        participantNames: { [user.uid]: senderName, [peerUid]: peerName },
        lastMessageAt: now,
      }
      if (!convSnap.exists) {
        tx.set(convRef, { ...conversationFields, createdAt: now })
      } else {
        tx.update(convRef, conversationFields)
      }
      tx.set(msgRef, {
        conversationId,
        senderUid: user.uid,
        body: messageBody,
        createdAt: now,
        read: false,
      })
    })

    await writeAuditLog({
      action: 'message_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: peerUid,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ conversationId, messageId: msgRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
