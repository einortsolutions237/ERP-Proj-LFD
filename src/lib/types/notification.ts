export type NotificationType = 'low_stock' | 'leave_request_submitted' | 'leave_request_reviewed' | 'appointment_scheduled' | 'lab_result_entered'

export interface Notification {
  id: string
  recipientUid: string
  type: NotificationType
  title: string
  body: string
  relatedId: string
  read: boolean
  createdAt: FirebaseFirestore.Timestamp
}
