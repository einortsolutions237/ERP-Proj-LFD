import { NextResponse } from 'next/server'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { hasEffectiveCapability, isBranchLocked } from '@/lib/auth/permissions'
import { getSessionUser, AuthError } from '@/lib/auth/server-guard'
import { ATTACHMENT_CAPABILITIES, isAttachableCollection } from '@/lib/attachments/capabilityMap'
import { sanitizeFileName } from '@/lib/attachments/sanitizeFileName'

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
    if (!hasEffectiveCapability(user, view)) {
      throw new AuthError('Forbidden', 403)
    }

    // Branch guard: attachments are denormalised with the related document's
    // branchId at upload time. A null branchId means the related document
    // itself has no branchId (org-wide record) — treated as visible to any
    // holder of the view capability, matching how the underlying record
    // itself would already be visible to them. A branch-locked viewer whose
    // branch doesn't match a real branchId gets 404, not 403, so a
    // cross-branch attachment's existence is never revealed — same
    // rationale as assertBranchAccessible's own 404-not-403 shape elsewhere.
    const attachmentBranchId = (data.branchId as string | null) ?? null
    if (isBranchLocked(user.role) && attachmentBranchId !== null && attachmentBranchId !== user.branchId) {
      throw new AuthError('Not found', 404)
    }

    let buffer: Buffer
    try {
      const bucket = getAdminStorage().bucket()
      const downloaded = await bucket.file(data.storagePath as string).download()
      buffer = downloaded[0]
    } catch {
      return NextResponse.json({ error: 'Could not retrieve the file — try again' }, { status: 502 })
    }

    const safeName = sanitizeFileName(data.fileName as string)
    const encodedName = encodeURIComponent(safeName)

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': data.mimeType as string,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="${safeName}"; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(data.sizeBytes as number),
      },
    })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
