export type AuditAction =
  | 'login' | 'login_failed' | 'logout'
  | 'staff_create' | 'staff_edit' | 'staff_delete'
  | 'permission_change'
  | 'supplier_create' | 'supplier_edit' | 'supplier_delete'
  | 'product_create' | 'product_edit' | 'product_delete'
  | 'service_create' | 'service_edit' | 'service_delete'
  | 'stock_adjust' | 'stock_transfer'
  | 'sale_create' | 'sale_void'
  | 'customer_create' | 'customer_edit' | 'customer_delete'
  | 'leave_request_create' | 'leave_request_approve' | 'leave_request_reject'
  | 'attendance_checkin' | 'attendance_checkout'
  | 'clinical_record_create' | 'clinical_record_view'
  | 'appointment_create' | 'appointment_update' | 'appointment_view'
  | 'lab_order_create' | 'lab_result_create' | 'lab_view' | 'lab_worklist_view'
  | 'seminar_create' | 'seminar_edit' | 'seminar_attendance_record' | 'seminar_attendance_view'
  | 'pending_delivery_fulfilled'
  | 'patient_demographics_record'
  | 'nursing_visit_record'
  | 'intake_questionnaire_edit'
  | 'intake_view'
  | 'message_create'
  | 'expense_create'

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
