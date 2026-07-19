export interface Attachment {
  id: string
  relatedCollection: string
  relatedDocId: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedBy: string
  branchId: string | null
  createdAt: FirebaseFirestore.Timestamp
}
