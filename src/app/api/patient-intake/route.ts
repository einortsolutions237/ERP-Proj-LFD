import { NextResponse } from 'next/server'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getPatientIntake } from '@/lib/clinical/getPatientIntake'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function GET(request: Request) {
  try {
    const user = await requireCapability('clinical.intake.view')
    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')
    if (!isNonEmptyString(customerId)) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    const intake = await getPatientIntake(customerId, user)
    return NextResponse.json(intake)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
