export type SeminarFormat = 'physical' | 'online' | 'hybrid'

export interface Seminar {
  id: string
  title: string
  description: string | null
  scheduledAt: FirebaseFirestore.Timestamp
  format: SeminarFormat
  branchId: string | null
  createdBy: string
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
}
