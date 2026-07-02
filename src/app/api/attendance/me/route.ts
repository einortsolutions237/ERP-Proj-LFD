import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getTodayDateString } from '@/lib/attendance/today'

export async function GET() {
  try {
    const user = await requireCapability('hr.attendance.self')
    const db = getAdminFirestore()

    const today = getTodayDateString()
    const snap = await db.collection('attendanceRecords').doc(`${user.uid}_${today}`).get()
    return NextResponse.json(snap.exists ? { id: snap.id, ...snap.data() } : null)
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
