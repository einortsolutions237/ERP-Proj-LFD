import { redirect } from 'next/navigation'
import { requireCapability, AuthError } from '@/lib/auth/server-guard'
import ThreadView from '@/components/messaging/ThreadView'

export default async function MessageThreadPage({ params }: { params: Promise<{ peerUid: string }> }) {
  const { peerUid } = await params
  let user
  try {
    user = await requireCapability('messaging.access')
  } catch (err) {
    if (err instanceof AuthError) redirect('/dashboard?error=not-authorized')
    throw err
  }

  return (
    <div className="mx-auto mt-12 h-[70vh] max-w-2xl">
      <ThreadView peerUid={peerUid} ownUid={user.uid} />
    </div>
  )
}
