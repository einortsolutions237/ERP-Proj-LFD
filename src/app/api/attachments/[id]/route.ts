import { NextResponse } from 'next/server'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import { getSessionUser, AuthError } from '@/lib/auth/server-guard'
import { ATTACHMENT_CAPABILITIES, isAttachableCollection } from '@/lib/attachments/capabilityMap'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const user = await getSessionUser()
    if (!user) throw new AuthError('Not signed in', 401)

    const db = getAdminFirestore()
    const doc = await db.collection('attachments').doc(id).get()
    if (!doc.exists) throw new AuthError('Not found', 404)

    const data = doc.data()!
    const relatedCollection = data.relatedCollection as string
    if (!isAttachableCollection(relatedCollection)) {
      // Defensive only — every attachment is written by this app's own
      // upload route, which already validates relatedCollection against
      // this same map, so this branch should be unreachable in practice.
      throw new AuthError('Not found', 404)
    }

    const { view } = ATTACHMENT_CAPABILITIES[relatedCollection]
    if (!hasCapability(user.role, view)) {
      throw new AuthError('Forbidden', 403)
    }

    const bucket = getAdminStorage().bucket()
    const [buffer] = await bucket.file(data.storagePath as string).download()

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': data.mimeType as string,
        'Content-Disposition': `inline; filename="${data.fileName as string}"`,
        'Content-Length': String(data.sizeBytes as number),
      },
    })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
