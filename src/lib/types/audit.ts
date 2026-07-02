export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'staff_create' | 'staff_edit' | 'staff_delete'
  | 'permission_change'
  | 'supplier_create' | 'supplier_edit' | 'supplier_delete'
  | 'product_create' | 'product_edit' | 'product_delete'
  | 'service_create' | 'service_edit' | 'service_delete'
  | 'stock_adjust' | 'stock_transfer'
  | 'sale_create' | 'sale_void'

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
