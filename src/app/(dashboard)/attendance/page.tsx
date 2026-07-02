import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getTodayDateString } from '@/lib/attendance/today'
import type { AttendanceRecord } from '@/lib/types/attendance'

// Rows are built field-by-field from the raw doc (never spread) so a
// Firestore Timestamp can never leak into this page's render — same
// discipline as leave/review/page.tsx's ReviewRow and
// customers/[id]/page.tsx's PurchaseRow.
interface AttendanceRow {
  id: string
  staffName: string
  date: string
  status: string
  checkInAt: string
  checkOutAt: string | null
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; history?: string }>
}) {
  const { date: dateParam, history } = await searchParams

  let user
  try {
    user = await requireCapability('hr.attendance.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const isHistory = Boolean(history)
  const date = dateParam ?? getTodayDateString()

  let query: FirebaseFirestore.Query
  if (isHistory) {
    // Full history, all dates — mirrors H5's history mode.
    query =
      user.role === 'branch_manager'
        ? db.collection('attendanceRecords').where('branchId', '==', user.branchId).orderBy('date', 'desc')
        : db.collection('attendanceRecords').orderBy('date', 'desc')
  } else {
    // Day roster: pure equality query, no .orderBy() — mirrors H5's default
    // mode, avoids needing a composite index.
    query =
      user.role === 'branch_manager'
        ? db.collection('attendanceRecords').where('branchId', '==', user.branchId).where('date', '==', date)
        : db.collection('attendanceRecords').where('date', '==', date)
  }

  const snap = await query.get()
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as AttendanceRecord }))

  const uniqueStaffIds = Array.from(new Set(docs.map((d) => d.data.staffId)))
  const staffDocs = await Promise.all(uniqueStaffIds.map((id) => db.collection('staff').doc(id).get()))
  const staffNames: Record<string, string> = {}
  uniqueStaffIds.forEach((id, i) => {
    staffNames[id] = staffDocs[i].data()?.name ?? id
  })

  const rows: AttendanceRow[] = docs.map(({ id, data }) => ({
    id,
    staffName: staffNames[data.staffId] ?? data.staffId,
    date: data.date,
    status: data.status,
    checkInAt: data.checkInAt.toDate().toLocaleTimeString(),
    checkOutAt: data.checkOutAt ? data.checkOutAt.toDate().toLocaleTimeString() : null,
  }))

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Attendance</h1>
        {isHistory ? (
          <Link href="/attendance" className="underline text-sm">
            Back to today&apos;s roster
          </Link>
        ) : (
          <Link href="/attendance?history=true" className="underline text-sm">
            View history
          </Link>
        )}
      </div>

      {!isHistory && (
        <form method="GET" className="flex items-end gap-2">
          <div>
            <label className="block text-sm font-medium">Date</label>
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="bg-black text-white rounded px-3 py-2 text-sm">
            View day
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          {isHistory ? 'No attendance history.' : 'No attendance records for this day.'}
        </p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Staff</th>
              {isHistory && <th className="py-2 pr-4">Date</th>}
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Check In</th>
              <th className="py-2 pr-4">Check Out</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2 pr-4">{row.staffName}</td>
                {isHistory && <td className="py-2 pr-4">{row.date}</td>}
                <td className="py-2 pr-4">{row.status}</td>
                <td className="py-2 pr-4">{row.checkInAt}</td>
                <td className="py-2 pr-4">{row.checkOutAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
