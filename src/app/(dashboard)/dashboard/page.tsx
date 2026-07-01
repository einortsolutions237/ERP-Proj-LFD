import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/server-guard'

export default async function DashboardPage() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return (
    <div className="max-w-2xl space-y-2">
      <h1 className="text-xl font-semibold">Welcome, {user.email}</h1>
      <p className="text-sm text-zinc-600">
        Role: <span className="font-medium">{user.role}</span> &middot; Branch:{' '}
        <span className="font-medium">{user.branchId}</span>
      </p>
    </div>
  )
}
