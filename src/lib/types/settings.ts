export interface SystemSetting {
  key: string
  value: string | number | boolean
  branchId: string | null
  updatedAt: FirebaseFirestore.Timestamp
  updatedBy: string
}
