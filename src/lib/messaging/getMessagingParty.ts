import { getAdminAuth } from '@/lib/firebase/admin'
import type { RoleId } from '@/lib/auth/permissions'
import type { MessagingParty } from './canMessage'

// Re-derives a user's CURRENT role/branchId from their Firebase Auth custom
// claims — the sole source of truth for authorization in this app — rather
// than the `staff` Firestore doc, which is profile metadata only and must
// never back an access-control decision (see CLAUDE.md's Permissions
// section). The caller's own session cookie already carries live claims
// (verifySessionCookie's checkRevoked=true means a stale session can't even
// authenticate); this helper exists specifically for the OTHER participant,
// whose claims we have no session for and must fetch directly.
export async function getMessagingParty(uid: string): Promise<MessagingParty | null> {
  const userRecord = await getAdminAuth().getUser(uid).catch(() => null)
  if (!userRecord) return null
  const claims = userRecord.customClaims as { role?: RoleId; branchId?: string } | undefined
  if (!claims?.role || !claims?.branchId) return null
  return { uid, role: claims.role, branchId: claims.branchId }
}
