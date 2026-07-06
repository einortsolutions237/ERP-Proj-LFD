export type AttendanceMethod = 'physical' | 'online'

export interface SeminarAttendance {
  id: string
  seminarId: string
  customerId: string
  method: AttendanceMethod
  recordedBy: string
  recordedAt: FirebaseFirestore.Timestamp
}
