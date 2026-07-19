'use client'
import type { AuditLogEntry } from '@/lib/types/audit'

// Server Components can't pass Firestore Timestamp instances to Client
// Components (Next.js only serializes plain objects across that boundary),
// so the list page converts createdAt to ISO string before handing
// rows to this table.
export type AuditLogRow = Omit<AuditLogEntry, 'createdAt'> & {
  createdAt: string
}

export default function AuditLogTable({ logs }: { logs: AuditLogRow[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-slate">No audit log entries yet.</p>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-mist/40">
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Timestamp</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Action</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Actor Email</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Target UID</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {logs.map((row) => (
            <tr key={row.id} className="hover:bg-mist/40 transition-colors duration-200">
              <td className="px-3 py-2 text-ink">{new Date(row.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2 text-ink">{row.action}</td>
              <td className="px-3 py-2 text-ink">{row.actorEmail ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink">{row.targetUid ?? '—'}</td>
              <td className="px-3 py-2 text-ink">{row.branchId ?? '—'}</td>
              <td className="px-3 py-2 font-mono text-xs text-ink">
                {row.details ? JSON.stringify(row.details) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
