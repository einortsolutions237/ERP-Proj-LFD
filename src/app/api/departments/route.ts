import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET() {
  try {
    const user = await requireCapability('admin.departments.manage')
    // branch_manager is a legitimate, branch-locked caller here (unlike
    // staff, where every ADMIN_HR caller today is org-wide) — it stays
    // restricted to its own branch. super_admin/admin see every branch.
    const collection = getAdminFirestore().collection('departments')
    const snap = isBranchLocked(user.role)
      ? await collection.where('branchId', '==', user.branchId).get()
      : await collection.get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('admin.departments.manage')
    const body = await request.json()

    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const db = getAdminFirestore()

    // branch_manager is branch-locked and genuinely reaches this route (unlike
    // the staff-creation case) — a client-supplied branchId must never be able
    // to override user.branchId for it. Non-branch-locked roles (super_admin/
    // admin) may explicitly target any real branch.
    let targetBranchId = user.branchId
    if (!isBranchLocked(user.role) && 'branchId' in body && body.branchId !== undefined && body.branchId !== null) {
      if (!isNonEmptyString(body.branchId)) {
        return NextResponse.json({ error: 'branchId must be a non-empty string' }, { status: 400 })
      }
      const requestedBranchId = body.branchId.trim()
      const branchSnap = await db.collection('branches').doc(requestedBranchId).get()
      if (!branchSnap.exists) {
        return NextResponse.json({ error: 'branchId does not reference an existing branch' }, { status: 400 })
      }
      targetBranchId = requestedBranchId
    }

    const departmentData = {
      name: body.name.trim(),
      branchId: targetBranchId,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await db.collection('departments').add(departmentData)

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
