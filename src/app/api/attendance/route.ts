import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getTodayDateString } from '@/lib/attendance/today'

export async function GET(request: Request) {
  try {
    const user = await requireCapability('hr.attendance.view')
    const url = new URL(request.url)
    const history = url.searchParams.get('history')
    const db = getAdminFirestore()

    if (history) {
      // Full history, all dates — date param is ignored in this mode.
      let query: FirebaseFirestore.Query =
        user.role === 'branch_manager'
          ? db.collection('attendanceRecords').where('branchId', '==', user.branchId)
          : db.collection('attendanceRecords')

      query = query.orderBy('date', 'desc')

      const snap = await query.get()
      return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    }

    // Day roster (default): pure equality query, no .orderBy() — avoids
    // needing a composite index (see Task H5 brief / H6 for indexes).
    const date = url.searchParams.get('date') ?? getTodayDateString()
    const query: FirebaseFirestore.Query =
      user.role === 'branch_manager'
        ? db.collection('attendanceRecords').where('branchId', '==', user.branchId).where('date', '==', date)
        : db.collection('attendanceRecords').where('date', '==', date)

    const snap = await query.get()
    return NextResponse.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
