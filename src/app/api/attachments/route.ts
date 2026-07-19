import { NextResponse } from 'next/server'
import { getAdminFirestore, getAdminStorage } from '@/lib/firebase/admin'
import { hasCapability } from '@/lib/auth/permissions'
import { getSessionUser, AuthError } from '@/lib/auth/server-guard'
import { writeAuditLog } from '@/lib/audit/log'
import { ATTACHMENT_CAPABILITIES, isAttachableCollection } from '@/lib/attachments/capabilityMap'

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const user = await getSessionUser()
    if (!user) throw new AuthError('Not signed in', 401)

    const formData = await request.formData()
    const relatedCollection = formData.get('relatedCollection')
    const relatedDocId = formData.get('relatedDocId')
    const file = formData.get('file')

    if (typeof relatedCollection !== 'string' || !isAttachableCollection(relatedCollection)) {
      return NextResponse.json({ error: 'relatedCollection must be one of: labResults, expenses' }, { status: 400 })
    }
    if (typeof relatedDocId !== 'string' || relatedDocId.trim().length === 0) {
      return NextResponse.json({ error: 'relatedDocId is required' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const { manage } = ATTACHMENT_CAPABILITIES[relatedCollection]
    if (!hasCapability(user.role, manage)) {
      throw new AuthError('Forbidden', 403)
    }

    if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type}" — only JPEG, PNG, and PDF are accepted` },
        { status: 400 }
      )
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File is ${file.size} bytes, exceeding the ${MAX_SIZE_BYTES} byte (10MB) limit` },
        { status: 400 }
      )
    }

    const db = getAdminFirestore()
    const relatedRef = db.collection(relatedCollection).doc(relatedDocId)
    const relatedSnap = await relatedRef.get()
    if (!relatedSnap.exists) {
      return NextResponse.json({ error: 'relatedDocId does not reference an existing document' }, { status: 400 })
    }
    const branchId = (relatedSnap.data()?.branchId as string | undefined) ?? null

    const attachmentRef = db.collection('attachments').doc()
    const storagePath = `attachments/${relatedCollection}/${relatedDocId}/${attachmentRef.id}-${file.name}`

    const buffer = Buffer.from(await file.arrayBuffer())
    try {
      const bucket = getAdminStorage().bucket()
      await bucket.file(storagePath).save(buffer, { contentType: file.type })
    } catch {
      return NextResponse.json({ error: 'Could not upload the file — try again' }, { status: 502 })
    }

    await attachmentRef.set({
      relatedCollection,
      relatedDocId,
      storagePath,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedBy: user.uid,
      branchId,
      createdAt: new Date(),
    })

    await writeAuditLog({
      action: 'attachment_upload',
      actorUid: user.uid,
      actorEmail: user.email,
      targetUid: relatedDocId,
      branchId,
      details: { relatedCollection, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
    })

    return NextResponse.json({ id: attachmentRef.id }, { status: 201 })
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }
}
