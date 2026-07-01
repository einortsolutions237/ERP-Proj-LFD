import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET() {
  try {
    await requireCapability('admin.branches.manage')
    // Unfiltered on purpose: branches don't carry a branchId field (a branch
    // document IS the branch), and branch admins need to see/manage every
    // branch, not just their own.
    const snap = await getAdminFirestore().collection('branches').get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    await requireCapability('admin.branches.manage')
    const body = await request.json()

    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.address)) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 })
    }
    if ('phone' in body && body.phone !== null && typeof body.phone !== 'string') {
      return NextResponse.json({ error: 'phone must be a string or null' }, { status: 400 })
    }

    const branchData = {
      name: body.name.trim(),
      address: body.address.trim(),
      phone: isNonEmptyString(body.phone) ? body.phone.trim() : null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await getAdminFirestore().collection('branches').add(branchData)

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
