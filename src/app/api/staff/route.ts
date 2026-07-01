import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { randomBytes } from 'node:crypto'
import { ROLES } from '@/lib/auth/permissions'

export async function GET() {
  try {
    const user = await requireCapability('admin.staff.view')
    const snap = await getAdminFirestore().collection('staff').where('branchId', '==', user.branchId).get()
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

    const auth = getAdminAuth()
    const tempPassword = randomBytes(18).toString('base64url')
    const userRecord = await auth.createUser({ email: body.email, password: tempPassword, emailVerified: false })
    await auth.setCustomUserClaims(userRecord.uid, { role: body.role, branchId: user.branchId, superAdmin: false })

    const staffData = {
      uid: userRecord.uid,
      email: body.email,
      name: body.name,
      role: body.role,
      branchId: user.branchId,
      department: body.department ?? null,
      contact: body.contact ?? { phone: null, address: null },
      emergencyContact: body.emergencyContact ?? { name: null, phone: null, relationship: null },
      employment: { startDate: new Date(body.startDate ?? Date.now()), status: 'active' },
      qualifications: body.qualifications ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user.uid,
    }
    await getAdminFirestore().collection('staff').doc(userRecord.uid).set(staffData)
    await writeAuditLog({ action: 'staff_create', actorUid: user.uid, actorEmail: user.email, targetUid: userRecord.uid, branchId: user.branchId })

    return NextResponse.json({ uid: userRecord.uid, tempPassword }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
