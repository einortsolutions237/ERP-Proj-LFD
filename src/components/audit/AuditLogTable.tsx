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
  return (
    <div className="space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Timestamp</th>
            <th className="py-2 pr-4">Action</th>
            <th className="py-2 pr-4">Actor Email</th>
            <th className="py-2 pr-4">Target UID</th>
            <th className="py-2 pr-4">Branch</th>
            <th className="py-2 pr-4">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="py-2 pr-4">{new Date(row.createdAt).toLocaleString()}</td>
              <td className="py-2 pr-4">{row.action}</td>
              <td className="py-2 pr-4">{row.actorEmail ?? '—'}</td>
              <td className="py-2 pr-4 font-mono text-xs">{row.targetUid ?? '—'}</td>
              <td className="py-2 pr-4">{row.branchId ?? '—'}</td>
              <td className="py-2 pr-4 font-mono text-xs">
                {row.details ? JSON.stringify(row.details) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
