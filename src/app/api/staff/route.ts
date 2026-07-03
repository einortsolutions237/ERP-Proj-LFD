import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { randomBytes } from 'node:crypto'
import { ROLES, isBranchLocked } from '@/lib/auth/permissions'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET() {
  try {
    const user = await requireCapability('admin.staff.view')
    // admin.staff.view is granted to ADMIN_HR, none of which are branch-locked
    // today — but if it's ever also granted to a branch-locked role, that role
    // must still only see its own branch's staff.
    const collection = getAdminFirestore().collection('staff')
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
    const user = await requireCapability('admin.staff.create')
    const body = await request.json()

    if (body.role === 'super_admin') {
      return NextResponse.json({ error: 'super_admin cannot be assigned through this endpoint' }, { status: 403 })
    }
    if (!ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.email)) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }

    const auth = getAdminAuth()
    const db = getAdminFirestore()

    // branch_manager/cashier are branch-locked roles. Even though neither can
    // reach this route today via admin.staff.create (only ADMIN_HR can), a
    // client-supplied branchId must never be able to override user.branchId
    // for a branch-locked role — the same "never let a client-supplied value
    // silently override a server-controlled field" reasoning that already
    // excludes branchId from EDITABLE_FIELDS on the sibling edit route.
    const BRANCH_LOCKED = isBranchLocked(user.role)

    let targetBranchId = user.branchId
    if (!BRANCH_LOCKED && 'branchId' in body && body.branchId !== undefined && body.branchId !== null) {
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

    const tempPassword = randomBytes(18).toString('base64url')
    // Create the Auth user first, but do NOT set custom claims yet — until the
    // Firestore doc is written, this account has no role/branchId claims, so
    // getSessionUser()/requireCapability() reject it even if it somehow tried
    // to authenticate mid-creation.
    const userRecord = await auth.createUser({ email: body.email, password: tempPassword, emailVerified: false })

    const staffData = {
      uid: userRecord.uid,
      email: body.email,
      name: body.name,
      role: body.role,
      branchId: targetBranchId,
      department: body.department ?? null,
      contact: body.contact ?? { phone: null, address: null },
      emergencyContact: body.emergencyContact ?? { name: null, phone: null, relationship: null },
      employment: { startDate: new Date(body.startDate ?? Date.now()), status: 'active' },
      qualifications: body.qualifications ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user.uid,
    }

    try {
      await db.collection('staff').doc(userRecord.uid).set(staffData)
    } catch (writeErr) {
      // No Firestore doc exists, so there's nothing else to clean up — just
      // remove the orphaned Auth user and surface the original failure.
      await auth.deleteUser(userRecord.uid).catch(() => {})
      throw writeErr
    }

    try {
      await auth.setCustomUserClaims(userRecord.uid, { role: body.role, branchId: targetBranchId, superAdmin: false })
    } catch (claimsErr) {
      // Firestore doc and Auth user are both now inconsistent — remove both
      // rather than leave a claims-less orphan behind.
      await db.collection('staff').doc(userRecord.uid).delete().catch(() => {})
      await auth.deleteUser(userRecord.uid).catch(() => {})
      throw claimsErr
    }

    await writeAuditLog({ action: 'staff_create', actorUid: user.uid, actorEmail: user.email, targetUid: userRecord.uid, branchId: targetBranchId })

    return NextResponse.json({ uid: userRecord.uid, tempPassword }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
