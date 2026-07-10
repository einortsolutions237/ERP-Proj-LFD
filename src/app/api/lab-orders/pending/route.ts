import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getPendingLabOrders } from '@/lib/clinical/getPendingLabOrders'

export async function GET() {
  try {
    const user = await requireCapability('clinical.lab.results.enter')
    const rows = await getPendingLabOrders(user)
    return NextResponse.json(rows)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
