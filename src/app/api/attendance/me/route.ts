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
    if (!snap.exists) return NextResponse.json(null)

    const data = snap.data()!
    // Firestore's Timestamp has no toJSON(), so a raw spread here would
    // serialize checkInAt/checkOutAt as {_seconds, _nanoseconds} instead of
    // a string this route's only consumer (a client component) can parse.
    return NextResponse.json({
      id: snap.id,
      staffId: data.staffId,
      branchId: data.branchId,
      date: data.date,
      status: data.status,
      checkInAt: data.checkInAt.toDate().toISOString(),
      checkOutAt: data.checkOutAt ? data.checkOutAt.toDate().toISOString() : null,
    })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
