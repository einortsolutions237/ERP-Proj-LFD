import { getAdminFirestore } from '@/lib/firebase/admin'
import type { AuditAction } from '@/lib/types/audit'

export interface WriteAuditLogInput {
  action: AuditAction
  actorUid: string | null
  actorEmail: string | null
  targetUid?: string | null
  branchId?: string | null
  details?: Record<string, unknown> | null
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const db = getAdminFirestore()
  await db.collection('auditLogs').add({
    action: input.action,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail,
    targetUid: input.targetUid ?? null,
    branchId: input.branchId ?? null,
    details: input.details ?? null,
    createdAt: new Date(),
  })
}
