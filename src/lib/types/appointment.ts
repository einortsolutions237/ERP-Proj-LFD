export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export interface Appointment {
  id: string
  customerId: string
  doctorUid: string
  branchId: string
  scheduledAt: FirebaseFirestore.Timestamp
  durationMinutes: number
  status: AppointmentStatus
  reason: string | null
  cancelledAt: FirebaseFirestore.Timestamp | null
  cancelledBy: string | null
  cancellationReason: string | null
  createdBy: string
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
