import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import ConversationList from '@/components/messaging/ConversationList'

export default async function MessagesPage() {
  try {
    await requireCapability('messaging.access')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="mx-auto mt-12 max-w-2xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Messages</h1>
      <ConversationList />
    </div>
  )
}
