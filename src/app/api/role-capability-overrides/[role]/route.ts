import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { ROLES, ROLE_CAPABILITIES, type RoleId, type Capability } from '@/lib/auth/permissions'
import { validateRoleCapabilityOverride } from '@/lib/auth/roleOverrideValidation'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getAllRoleOverrides } from '@/lib/auth/roleOverrides'
import { writeAuditLog } from '@/lib/audit/log'

function isRoleId(value: string): value is RoleId {
  return (ROLES as readonly string[]).includes(value)
}

export async function PUT(request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role: roleParam } = await params
  try {
    const user = await requireCapability('admin.roleOverrides.manage')

    if (!isRoleId(roleParam)) {
      return NextResponse.json({ error: 'Not a real role' }, { status: 400 })
    }
    const role = roleParam

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 })
    }
    if (!Array.isArray(body.capabilities) || !body.capabilities.every((c: unknown) => typeof c === 'string' && c in ROLE_CAPABILITIES)) {
      return NextResponse.json({ error: 'capabilities must be an array of known capability strings' }, { status: 400 })
    }
    const newCapabilities = body.capabilities as Capability[]

    const currentOverrides = await getAllRoleOverrides()
    const validationError = validateRoleCapabilityOverride(role, newCapabilities, currentOverrides)
    if (validationError) {
      return NextResponse.json({ error: validationError.message, reason: validationError.reason }, { status: 400 })
    }

    const before = currentOverrides[role] ?? null

    const db = getAdminFirestore()
    await db.collection('roleCapabilityOverrides').doc(role).set({
      role,
      capabilities: newCapabilities,
      updatedAt: new Date(),
      updatedBy: user.uid,
    })

    await writeAuditLog({
      action: 'role_capability_override_change',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: null,
      details: { role, before, after: newCapabilities },
    })

    return NextResponse.json({ ok: true, role, capabilities: newCapabilities })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ role: string }> }) {
  const { role: roleParam } = await params
  try {
    const user = await requireCapability('admin.roleOverrides.manage')

    if (!isRoleId(roleParam)) {
      return NextResponse.json({ error: 'Not a real role' }, { status: 400 })
    }
    const role = roleParam
    if (role === 'super_admin') {
      return NextResponse.json({ error: "super_admin's capabilities cannot be edited through this mechanism." }, { status: 400 })
    }

    const db = getAdminFirestore()
    const docRef = db.collection('roleCapabilityOverrides').doc(role)
    const existing = await docRef.get()
    const before = existing.exists ? (existing.data()!.capabilities as Capability[]) : null

    if (existing.exists) {
      await docRef.delete()
    }

    await writeAuditLog({
      action: 'role_capability_override_change',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: null,
      branchId: null,
      details: { role, before, after: null },
    })

    return NextResponse.json({ ok: true, role, capabilities: null })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
