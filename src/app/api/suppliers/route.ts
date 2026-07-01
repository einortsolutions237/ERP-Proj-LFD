import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Never trust a client-sent `contact` object wholesale — pull each sub-field
// out and validate it independently, same defensive posture as branches'
// flat fields.
function extractContactSource(body: Record<string, unknown>): Record<string, unknown> {
  if (!('contact' in body) || body.contact === null) return {}
  if (!isPlainObject(body.contact)) throw new Error('contact must be an object')
  return body.contact
}

function validateContactField(source: Record<string, unknown>, field: 'phone' | 'email' | 'address'): string | null {
  if (!(field in source) || source[field] === null || source[field] === undefined) return null
  if (!isNonEmptyString(source[field])) throw new Error(`contact.${field} must be a non-empty string or null`)
  return (source[field] as string).trim()
}

export async function GET() {
  try {
    await requireCapability('inventory.suppliers.manage')
    // Unfiltered on purpose: suppliers are an org-wide catalog collection,
    // not branch-scoped (same reasoning as branches).
    const snap = await getAdminFirestore().collection('suppliers').get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('inventory.suppliers.manage')
    const body = await request.json()

    if (!isNonEmptyString(body.name)) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    let contact: { phone: string | null; email: string | null; address: string | null }
    try {
      const source = extractContactSource(body)
      contact = {
        phone: validateContactField(source, 'phone'),
        email: validateContactField(source, 'email'),
        address: validateContactField(source, 'address'),
      }
    } catch (validationErr) {
      return NextResponse.json({ error: (validationErr as Error).message }, { status: 400 })
    }

    if ('notes' in body && body.notes !== null && typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 })
    }
    const notes = isNonEmptyString(body.notes) ? body.notes.trim() : null

    const supplierData = {
      name: body.name.trim(),
      contact,
      notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await getAdminFirestore().collection('suppliers').add(supplierData)

    await writeAuditLog({ action: 'supplier_create', actorUid: user.uid, actorEmail: user.email, targetUid: docRef.id, branchId: null })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
