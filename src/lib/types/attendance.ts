export type AttendanceStatus = 'checked_in' | 'checked_out'

export interface AttendanceRecord {
  id: string
  staffId: string
  branchId: string
  date: string
  status: AttendanceStatus
  checkInAt: FirebaseFirestore.Timestamp
  checkOutAt: FirebaseFirestore.Timestamp | null
  createdAt: FirebaseFirestore.Timestamp
}
