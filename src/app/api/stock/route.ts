import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'

export async function GET() {
  try {
    const user = await requireCapability('inventory.stock.view')
    // branch_manager is a legitimate, branch-locked caller here — it stays
    // restricted to its own branch. super_admin/admin see every branch.
    const collection = getAdminFirestore().collection('productStock')
    const snap = isBranchLocked(user.role)
      ? await collection.where('branchId', '==', user.branchId).get()
      : await collection.get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
