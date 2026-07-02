export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface LeaveRequest {
  id: string
  staffId: string
  branchId: string
  type: LeaveType
  startDate: FirebaseFirestore.Timestamp
  endDate: FirebaseFirestore.Timestamp
  reason: string | null
  status: LeaveStatus
  reviewedBy: string | null
  reviewedAt: FirebaseFirestore.Timestamp | null
  reviewNote: string | null
  createdAt: FirebaseFirestore.Timestamp
}
