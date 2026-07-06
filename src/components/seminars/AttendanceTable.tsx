import type { SeminarAttendanceRow } from '@/lib/clinical/getSeminarAttendance'

export interface AttendanceTableProps {
  rows: SeminarAttendanceRow[]
  emptyMessage: string
}

export default function AttendanceTable({ rows, emptyMessage }: AttendanceTableProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate">{emptyMessage}</p>
  }

  return (
    <div className="overflow-hidden rounded-md border border-mist">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-mist/40">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Customer</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Method</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Recorded by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-mist/40 transition-colors">
              <td className="px-3 py-2 text-ink">{new Date(row.recordedAt).toLocaleString()}</td>
              <td className="px-3 py-2 text-ink">{row.customerName}</td>
              <td className="px-3 py-2 text-ink">{row.method}</td>
              <td className="px-3 py-2 text-ink">{row.recordedByName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
