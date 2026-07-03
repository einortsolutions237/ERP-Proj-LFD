import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { buildInventoryReport } from '@/lib/reports/inventory'

export async function GET() {
  try {
    const user = await requireCapability('reports.inventory.view')
    const report = await buildInventoryReport(user)
    return NextResponse.json(report)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
