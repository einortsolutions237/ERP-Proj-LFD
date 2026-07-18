import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildPnLReport, ReportValidationError, PnLValidationError } from '@/lib/reports/pnl'

export async function GET(request: Request) {
  try {
    const user = await requireCapability('accounting.pnl.view')
    const { searchParams } = new URL(request.url)
    const report = await buildPnLReport(
      user,
      searchParams.get('startDate'),
      searchParams.get('endDate'),
      searchParams.get('branchId')
    )
    return NextResponse.json(report)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof ReportValidationError || err instanceof PnLValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
}
