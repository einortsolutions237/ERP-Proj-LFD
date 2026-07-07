import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFunctionsFirestore } from './firestore'
import { isAlreadyExistsError } from './idempotent'

const PREVIEW_LENGTH = 80

export const onMessageSent = onDocumentCreated(
  { document: 'messages/{messageId}', database: 'default' },
  async (event) => {
    const message = event.data?.data()
    if (!message) return

    const { conversationId, senderUid, body } = message as {
      conversationId: string
      senderUid: string
      body: string
    }

    const db = getFunctionsFirestore()
    const convSnap = await db.collection('conversations').doc(conversationId).get()
    if (!convSnap.exists) return

    const conversation = convSnap.data() as { participantUids: string[]; participantNames?: Record<string, string> }
    const recipientUid = conversation.participantUids.find((uid) => uid !== senderUid)
    if (!recipientUid) return

    const senderName = conversation.participantNames?.[senderUid] ?? 'A colleague'
    const preview = body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH)}…` : body

    const messageId = event.params.messageId
    const notifRef = db.collection('notifications').doc(`message_received_${messageId}`)
    try {
      await notifRef.create({
        recipientUid,
        type: 'message_received',
        title: `New message from ${senderName}`,
        body: preview,
        relatedId: senderUid,
        read: false,
        createdAt: new Date(),
      })
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err
    }
  }
)
