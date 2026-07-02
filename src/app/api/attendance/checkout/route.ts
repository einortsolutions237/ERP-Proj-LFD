import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { getTodayDateString } from '@/lib/attendance/today'

export async function POST() {
  try {
    const user = await requireCapability('hr.attendance.self')
    const db = getAdminFirestore()

    const today = getTodayDateString()
    const docRef = db.collection('attendanceRecords').doc(`${user.uid}_${today}`)
    let result: { branchId: string }
    try {
      result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef)
        if (!snap.exists) {
          throw new AuthError('No check-in found for today', 404)
        }
        const existing = snap.data()!
        // Explicit transition guard — the only legal prior state for a
        // check-out is 'checked_in'. Do not infer from checkOutAt presence.
        if (existing.status !== 'checked_in') {
          throw new AuthError('Already checked out today', 409)
        }
        tx.update(docRef, { status: 'checked_out', checkOutAt: new Date() })
        return { branchId: existing.branchId as string }
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({ action: 'attendance_checkout', actorUid: user.uid, actorEmail: user.email, targetUid: user.uid, branchId: result.branchId })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
