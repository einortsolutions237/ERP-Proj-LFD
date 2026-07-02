// Firestore's create() rejects with this gRPC status code when the document
// already exists. Every trigger uses create() (never set()) for notification
// writes specifically so a Cloud Functions at-least-once retry of the same
// event fails loudly with exactly this error instead of silently re-writing
// — and every trigger swallows exactly this error, via this one shared
// check, rather than each re-deriving what "harmless duplicate" means.
const FIRESTORE_ALREADY_EXISTS_CODE = 6

export function isAlreadyExistsError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === FIRESTORE_ALREADY_EXISTS_CODE
}
