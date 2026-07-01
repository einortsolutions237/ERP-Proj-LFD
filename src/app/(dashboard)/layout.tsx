import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/server-guard'
import NavShell from '@/components/layout/NavShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Middleware (Task 5) only checked cookie presence. This is the actual
  // data-bearing check — verifies the session cookie and resolves the user.
  const user = await getSessionUser()
  if (!user) redirect('/login')

  return <NavShell user={user}>{children}</NavShell>
}
