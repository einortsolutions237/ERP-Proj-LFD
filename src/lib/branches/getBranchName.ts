import { getAdminFirestore } from '@/lib/firebase/admin'

export async function getBranchName(branchId: string): Promise<string> {
  const db = getAdminFirestore()
  const doc = await db.collection('branches').doc(branchId).get()
  return (doc.data()?.name as string | undefined) ?? branchId
}
