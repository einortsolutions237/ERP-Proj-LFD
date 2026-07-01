import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { ROLES } from '@/lib/auth/permissions'

// Fields a caller is ever allowed to change via this endpoint. branchId, uid,
// createdBy, createdAt are immutable/derived server-side and must never be
// settable from the request body, no matter what the client sends.
const EDITABLE_FIELDS = ['name', 'role', 'department', 'contact', 'emergencyContact', 'employment', 'qualifications'] as const

export async function PATCH(request: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params
  try {
    const user = await requireCapability('admin.staff.edit')
    const db = getAdminFirestore()
    const docRef = db.collection('staff').doc(staffId)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    // Don't reveal that a staff member exists in another branch — same 404 as a
    // genuinely missing doc.
    if (existing.branchId !== user.branchId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json()

    if ('role' in body && body.role !== undefined && !ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    if (existing.role === 'super_admin') {
      const attemptsRoleChange = 'role' in body && body.role !== 'super_admin'
      const attemptsDeactivate = body.employment?.status === 'inactive'
      if (attemptsRoleChange || attemptsDeactivate) {
        return NextResponse.json({ error: 'super_admin role/status cannot be modified' }, { status: 403 })
      }
    }
    if (body.role === 'super_admin' && existing.role !== 'super_admin') {
      return NextResponse.json({ error: 'super_admin cannot be assigned through this endpoint' }, { status: 403 })
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    for (const field of EDITABLE_FIELDS) {
      if (field in body) updates[field] = body[field]
    }
    await docRef.update(updates)

    const auth = getAdminAuth()
    const roleChanged = body.role && body.role !== existing.role
    const statusChangedToInactive = body.employment?.status === 'inactive' && existing.employment?.status !== 'inactive'
    const statusChangedToActive = body.employment?.status === 'active' && existing.employment?.status !== 'active'

    if (roleChanged) {
      await auth.setCustomUserClaims(staffId, { role: body.role, branchId: existing.branchId, superAdmin: false })
      await writeAuditLog({ action: 'permission_change', actorUid: user.uid, actorEmail: user.email, targetUid: staffId, branchId: existing.branchId, details: { from: existing.role, to: body.role } })
    }
    if (statusChangedToInactive) {
      // Firebase Auth is the enforcement point for deactivation (Design Decision #2) —
      // no Firestore read is needed at login time, verifyIdToken/verifySessionCookie
      // reject disabled users automatically.
      await auth.updateUser(staffId, { disabled: true })
    }
    if (statusChangedToActive) {
      await auth.updateUser(staffId, { disabled: false })
    }
    if (roleChanged || statusChangedToInactive) {
      // Forces immediate re-authentication instead of waiting out the old token's lifetime.
      await auth.revokeRefreshTokens(staffId)
    }

    await writeAuditLog({ action: 'staff_edit', actorUid: user.uid, actorEmail: user.email, targetUid: staffId, branchId: existing.branchId })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params
  try {
    const user = await requireCapability('admin.staff.delete')
    const db = getAdminFirestore()
    const docRef = db.collection('staff').doc(staffId)
    const doc = await docRef.get()
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = doc.data()!
    // Don't reveal that a staff member exists in another branch — same 404 as a
    // genuinely missing doc.
    if (existing.branchId !== user.branchId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.role === 'super_admin') {
      return NextResponse.json({ error: 'super_admin cannot be deleted' }, { status: 403 })
    }

    await docRef.delete()
    await getAdminAuth().deleteUser(staffId)
    await writeAuditLog({ action: 'staff_delete', actorUid: user.uid, actorEmail: user.email, targetUid: staffId, branchId: existing.branchId })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
