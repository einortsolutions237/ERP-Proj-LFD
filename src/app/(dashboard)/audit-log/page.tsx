import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import AuditLogTable, { type AuditLogRow } from '@/components/audit/AuditLogTable'

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
