import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { EXCLUDED_FROM_SALE_PICKER_CUSTOMER_IDS } from '@/lib/customers/pickerExclusions'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET() {
  try {
    await requireCapability('crm.customer.view')
    // Unfiltered by branch on purpose: customers are an org-wide collection,
    // not branch-scoped (same reasoning as products/suppliers/branches).
    // This route only backs the offline-queue "attach customer" picker
    // (QueueStatusIndicator.tsx), so the two non-deletable QA test
    // customers are excluded here too — see pickerExclusions.ts.
    const snap = await getAdminFirestore().collection('customers').get()
    return NextResponse.json(
      snap.docs
        .filter((d) => !EXCLUDED_FROM_SALE_PICKER_CUSTOMER_IDS.includes(d.id))
        .map((d) => ({ id: d.id, ...d.data() }))
    )
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('crm.customer.create')
    const body = await request.json()

    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.phone)) {
      return NextResponse.json({ error: 'phone is required' }, { status: 400 })
    }
    if ('email' in body && body.email !== null && !isNonEmptyString(body.email)) {
      return NextResponse.json({ error: 'email must be a non-empty string or null' }, { status: 400 })
    }
    if ('address' in body && body.address !== null && !isNonEmptyString(body.address)) {
      return NextResponse.json({ error: 'address must be a non-empty string or null' }, { status: 400 })
    }
    if ('notes' in body && body.notes !== null && !isNonEmptyString(body.notes)) {
      return NextResponse.json({ error: 'notes must be a non-empty string or null' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const phone = body.phone.trim()
    const newCustomerRef = db.collection('customers').doc()

    const creationPayload = {
      name: body.name.trim(),
      phone,
      email: isNonEmptyString(body.email) ? body.email.trim() : null,
      address: isNonEmptyString(body.address) ? body.address.trim() : null,
      notes: isNonEmptyString(body.notes) ? body.notes.trim() : null,
      registeredBranchId: user.branchId,
    }

    try {
      await db.runTransaction(async (tx) => {
        const phoneSnap = await tx.get(db.collection('customers').where('phone', '==', phone).limit(1))
        if (!phoneSnap.empty) {
          throw new AuthError('A customer with this phone number already exists', 409)
        }
        tx.set(newCustomerRef, {
          ...creationPayload,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({
      action: 'customer_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: newCustomerRef.id,
      branchId: null,
      details: creationPayload,
    })

    return NextResponse.json({ id: newCustomerRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
