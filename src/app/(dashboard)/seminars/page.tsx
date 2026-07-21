import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAnyCapability, AuthError } from '@/lib/auth/server-guard'
import { hasCapability } from '@/lib/auth/permissions'
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SeminarFormat } from '@/lib/types/seminar'

interface SeminarRow {
  id: string
  title: string
  scheduledAt: string
  format: SeminarFormat
  branchName: string | null
}

export default async function SeminarsPage() {
  let user
  try {
    user = await requireAnyCapability(['seminars.manage', 'seminars.attendance.record', 'seminars.attendance.view'])
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  const db = getAdminFirestore()
  const snap = await db.collection('seminars').orderBy('scheduledAt', 'desc').get()
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }))
  const uniqueBranchIds = Array.from(new Set(docs.map((d) => d.data.branchId as string | null).filter((v): v is string => !!v)))
  const branchDocs = await Promise.all(uniqueBranchIds.map((id) => db.collection('branches').doc(id).get()))
  const branchNames: Record<string, string> = {}
  uniqueBranchIds.forEach((id, i) => {
    branchNames[id] = (branchDocs[i].data()?.name as string | undefined) ?? id
  })

  const seminars: SeminarRow[] = docs.map(({ id, data }) => ({
    id,
    title: data.title as string,
    scheduledAt: (data.scheduledAt as FirebaseFirestore.Timestamp).toDate().toISOString(),
    format: data.format as SeminarFormat,
    branchName: data.branchId ? branchNames[data.branchId as string] ?? (data.branchId as string) : null,
  }))

  const canManage = hasCapability(user.role, 'seminars.manage')

  return (
    <div className="mx-auto mt-12 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Seminars</h1>
        {canManage && (
          <Link
            href="/seminars/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-marine px-3 text-paper transition-opacity duration-200"
          >
            New seminar
          </Link>
        )}
      </div>

      {seminars.length === 0 ? (
        <p className="text-sm text-slate">No seminars yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mist bg-surface shadow-[var(--shadow-card)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-mist/40">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Date/Time</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Title</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Format</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate">Branch</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {seminars.map((row) => (
                <tr key={row.id} className="transition-colors duration-200 hover:bg-mist/40">
                  <td className="px-3 py-2 text-ink">{new Date(row.scheduledAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-ink">{row.title}</td>
                  <td className="px-3 py-2 text-ink">{row.format}</td>
                  <td className="px-3 py-2 text-ink">{row.branchName ?? '—'}</td>
                  <td className="px-3 py-2 text-ink">
                    <Link href={`/seminars/${row.id}`} className="text-marine underline-offset-2 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
