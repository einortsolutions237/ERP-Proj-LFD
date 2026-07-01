import type { RoleId } from '@/lib/auth/permissions'

export interface Staff {
  uid: string
  email: string
  name: string
  role: RoleId
  branchId: string
  department: string | null
  contact: { phone: string | null; address: string | null }
  emergencyContact: { name: string | null; phone: string | null; relationship: string | null }
  employment: { startDate: string; status: 'active' | 'inactive' }
  qualifications: string[]
  createdAt: FirebaseFirestore.Timestamp
  updatedAt: FirebaseFirestore.Timestamp
  createdBy: string
}
