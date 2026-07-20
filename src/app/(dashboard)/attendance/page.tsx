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

const STATUS_BADGE: Record<string, string> = {
  checked_in: 'bg-success/10 text-success',
  checked_out: 'bg-slate/10 text-slate',
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
        <h1 className="font-display text-2xl font-semibold text-ink">Attendance</h1>
        {isHistory ? (
          <Link
            href="/attendance"
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-marine transition-colors duration-200 hover:bg-mist hover:underline"
          >
            Back to today&apos;s roster
          </Link>
        ) : (
          <Link
            href="/attendance?history=true"
            className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-marine transition-colors duration-200 hover:bg-mist hover:underline"
          >
            View history
          </Link>
        )}
      </div>

      {!isHistory && (
        <form method="GET" className="flex items-end gap-2">
          <div>
            <label htmlFor="attendance-date" className="block text-sm font-medium text-ink">
              Date
            </label>
            <input
              id="attendance-date"
              type="date"
              name="date"
              defaultValue={date}
              className="rounded-lg border border-mist bg-paper px-3 py-2 text-sm text-ink focus:border-marine"
            />
          </div>
          <button type="submit" className="min-h-11 rounded-lg bg-marine px-3 text-sm text-paper transition-opacity duration-200 disabled:opacity-50">
            View day
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-slate">
          {isHistory ? 'No attendance history.' : 'No attendance records for this day.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Staff</th>
                {isHistory && <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>}
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Check In</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Check Out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
                  <td className="px-3 py-2 text-ink">{row.staffName}</td>
                  {isHistory && <td className="px-3 py-2 text-ink">{row.date}</td>}
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate/10 text-slate'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-ink">{row.checkInAt}</td>
                  <td className="px-3 py-2 font-mono text-ink">{row.checkOutAt ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
