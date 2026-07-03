import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildSalesReport, ReportValidationError } from '@/lib/reports/sales'

export async function GET(request: Request) {
  try {
    const user = await requireCapability('reports.sales.view')
    const { searchParams } = new URL(request.url)
    const report = await buildSalesReport(user, searchParams.get('startDate'), searchParams.get('endDate'))
    return NextResponse.json(report)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof ReportValidationError) return NextResponse.json({ error: err.message }, { status: 400 })
    throw err
  }
}
