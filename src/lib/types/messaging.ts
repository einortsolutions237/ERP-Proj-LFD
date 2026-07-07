import type { RoleId } from '@/lib/auth/permissions'

export interface Conversation {
  id: string
  participantUids: string[] // exactly 2, sorted ascending — also the deterministic doc ID, joined with '_'
  participantRoles: Record<string, RoleId>
  participantNames: Record<string, string>
  lastMessageAt: FirebaseFirestore.Timestamp
  createdAt: FirebaseFirestore.Timestamp
}

export interface Message {
  id: string
  conversationId: string
  senderUid: string
  body: string
  createdAt: FirebaseFirestore.Timestamp
  read: boolean
}
