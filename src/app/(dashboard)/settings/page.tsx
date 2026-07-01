import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import { getAdminFirestore } from '@/lib/firebase/admin'
import SettingsTable, { type SettingRow } from '@/components/settings/SettingsTable'

export default async function SettingsPage() {
  try {
    await requireCapability('admin.settings.manage')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  // Global-only in Phase 1 — no branchId filter, the whole collection is one
  // flat key-value store.
  const snap = await getAdminFirestore().collection('settings').get()
  const settings: SettingRow[] = snap.docs.map((d) => {
    const data = d.data()
    return {
      key: data.key,
      value: data.value,
      updatedAt: data.updatedAt?.toDate?.().toISOString() ?? '',
      updatedBy: data.updatedBy,
    }
  })

  return (
    <div className="max-w-4xl mx-auto mt-12 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>
      <SettingsTable settings={settings} />
    </div>
  )
}
