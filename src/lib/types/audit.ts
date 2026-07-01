export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'staff_create' | 'staff_edit' | 'staff_delete'
  | 'permission_change'

export interface AuditLogEntry {
  id: string
  action: AuditAction
  actorUid: string | null
  actorEmail: string | null
  targetUid: string | null
  branchId: string | null
  details: Record<string, unknown> | null
  createdAt: FirebaseFirestore.Timestamp
}
