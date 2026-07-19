import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { createPayrollRecord, queryPayrollRecords, PayrollValidationError } from '@/lib/payroll/store'

export async function GET() {
  try {
    const user = await requireCapability('payroll.record.view')
    const records = await queryPayrollRecords(user)
    return NextResponse.json(records)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCapability('payroll.record.create')
    const body = await request.json()

    let result
    try {
      result = await createPayrollRecord(user, {
        staffId: body.staffId,
        payPeriodStart: body.payPeriodStart,
        payPeriodEnd: body.payPeriodEnd,
        grossAmount: body.grossAmount,
        notes: body.notes,
      })
    } catch (err) {
      if (err instanceof PayrollValidationError) return NextResponse.json({ error: err.message }, { status: 400 })
      throw err
    }

    await writeAuditLog({
      action: 'payroll_record_create',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: result.payload.staffId as string,
      branchId: result.payload.branchId as string,
      details: result.payload,
    })

    return NextResponse.json({ id: result.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
