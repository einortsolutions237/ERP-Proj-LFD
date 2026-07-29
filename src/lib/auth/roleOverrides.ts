import { getAdminFirestore } from '@/lib/firebase/admin'
import type { RoleId, Capability } from './permissions'

// Shared by getRoleOverride/getAllRoleOverrides so every reader of this
// collection applies the same rules — a hand-written or malformed doc
// can never grant admin.roleOverrides.manage, and a non-array
// `capabilities` field is treated as "no override" rather than crashing.
function sanitizeOverrideCapabilities(raw: unknown): Capability[] | null {
  if (!Array.isArray(raw)) return null
  return (raw as Capability[]).filter((c) => c !== 'admin.roleOverrides.manage')
}

// Single-doc read, keyed by role — matches this codebase's dominant
// per-request existence-check idiom (every PATCH route reads its
// `existing` doc the same way). super_admin is structurally excluded:
// it never has a doc (the write path refuses to create one — Task 5),
// and this function refuses to even look regardless, belt-and-suspenders
// against a document manually created outside the app's own write path.
export async function getRoleOverride(role: RoleId): Promise<Capability[] | null> {
  if (role === 'super_admin') return null
  const db = getAdminFirestore()
  const doc = await db.collection('roleCapabilityOverrides').doc(role).get()
  if (!doc.exists) return null
  return sanitizeOverrideCapabilities(doc.data()!.capabilities)
}

// Used by Task 6's UI to render every role's effective set in one page
// load, without one Firestore read per role. Not used by the per-request
// resolution path (getSessionUser calls getRoleOverride, a single-doc
// read for exactly the acting user's own role — cheaper than a full
// collection scan on every request). Applies the same sanitization as
// getRoleOverride — the matrix must never display a capability the
// runtime doesn't actually honor, and must never show super_admin as
// having a document-backed override.
export async function getAllRoleOverrides(): Promise<Partial<Record<RoleId, Capability[]>>> {
  const db = getAdminFirestore()
  const snap = await db.collection('roleCapabilityOverrides').get()
  const result: Partial<Record<RoleId, Capability[]>> = {}
  for (const doc of snap.docs) {
    if (doc.id === 'super_admin') continue
    const sanitized = sanitizeOverrideCapabilities(doc.data().capabilities)
    if (sanitized) result[doc.id as RoleId] = sanitized
  }
  return result
}
