import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import AuditLogTable, { type AuditLogRow } from '@/components/audit/AuditLogTable'

// `details` is a free-form bag whose shape varies per action (expense_create,
// payroll_record_create, staff_edit, ...), several of which snapshot a full
// record — including its own Timestamp fields (date, payPeriodStart,
// createdAt) — into details at write time. Firestore returns those as
// Timestamp class instances on read, which Next.js cannot pass from a Server
// to a Client Component ("Only plain objects... can be passed"). Recursively
// converts any Timestamp-shaped value (duck-typed via toDate()) to an ISO
// string, the same conversion leave/page.tsx and attendance/page.tsx already
// apply field-by-field to their own known fields — this does it generically
// since details' shape isn't statically known.
function sanitizeTimestamps(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeTimestamps)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeTimestamps(v)]))
  }
  return value
}

export default async function AuditLogPage() {
  try {
    await requireCapability('admin.auditLog.view')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const snap = await getAdminFirestore().collection('auditLogs').orderBy('createdAt', 'desc').limit(200).get()
  const logs: AuditLogRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      ...data,
      details: data.details ? (sanitizeTimestamps(data.details) as Record<string, unknown>) : null,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? '',
    } as AuditLogRow
  })

  return (
    <div className="max-w-6xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Audit Log</h1>
      </div>
      <AuditLogTable logs={logs} />
    </div>
  )
}
