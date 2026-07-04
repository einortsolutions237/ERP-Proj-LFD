import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { getPatientTreatments } from '@/lib/clinical/getPatientTreatments'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET(request: Request) {
  try {
    const user = await requireCapability('clinical.record.view')
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    if (!isNonEmptyString(customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    const rows = await getPatientTreatments(customerId, user)
    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('clinical.record.create')
    const body = await request.json()

    if (!isNonEmptyString(body.customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.date)) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 })
    }
    if (!isNonEmptyString(body.diagnosis)) {
      return NextResponse.json({ error: 'diagnosis is required' }, { status: 400 })
    }

    const db = getAdminFirestore()
    const customerId = body.customerId.trim()
    const customerSnap = await db.collection('customers').doc(customerId).get()
    if (!customerSnap.exists) {
      return NextResponse.json({ error: 'customerId does not reference an existing customer' }, { status: 400 })
    }

    let linkedSaleId: string | null = null
    if ('linkedSaleId' in body && body.linkedSaleId !== undefined && body.linkedSaleId !== null && body.linkedSaleId !== '') {
      if (!isNonEmptyString(body.linkedSaleId)) {
        return NextResponse.json({ error: 'linkedSaleId must be a non-empty string' }, { status: 400 })
      }
      const requestedSaleId = body.linkedSaleId.trim()
      const saleSnap = await db.collection('sales').doc(requestedSaleId).get()
      if (!saleSnap.exists) {
        return NextResponse.json({ error: 'linkedSaleId does not reference an existing sale' }, { status: 400 })
      }
      if (saleSnap.data()?.customerId !== customerId) {
        return NextResponse.json({ error: 'linkedSaleId does not belong to this customer' }, { status: 400 })
      }
      linkedSaleId = requestedSaleId
    }

    const treatmentData = {
      customerId,
      doctorUid: user.uid,
      branchId: user.branchId,
      date: new Date(body.date),
      diagnosis: body.diagnosis.trim(),
      notes: isNonEmptyString(body.notes) ? body.notes.trim() : null,
      prescription: isNonEmptyString(body.prescription) ? body.prescription.trim() : null,
      linkedSaleId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const docRef = await db.collection('treatments').add(treatmentData)

    await writeAuditLog({
      action: 'clinical_record_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: customerId,
      branchId: user.branchId,
      details: null,
    })

    return NextResponse.json({ id: docRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
