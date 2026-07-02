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
    let created: { branchId: string }
    try {
      created = await db.runTransaction(async (tx) => {
        const snap = await tx.get(docRef)
        if (snap.exists) {
          throw new AuthError('Already checked in today', 409)
        }
        tx.set(docRef, {
          staffId: user.uid,
          branchId: user.branchId,
          date: today,
          status: 'checked_in',
          checkInAt: new Date(),
          checkOutAt: null,
          createdAt: new Date(),
        })
        return { branchId: user.branchId }
      })
    } catch (err) {
      if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    await writeAuditLog({ action: 'attendance_checkin', actorUid: user.uid, actorEmail: user.email, targetUid: user.uid, branchId: created.branchId })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
