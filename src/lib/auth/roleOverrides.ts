import { getAdminFirestore } from '@/lib/firebase/admin'
import type { RoleId, Capability } from './permissions'

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
  return doc.exists ? (doc.data()!.capabilities as Capability[]) : null
}

// Used by Task 6's UI to render every role's effective set in one page
// load, without one Firestore read per role. Not used by the per-request
// resolution path (getSessionUser calls getRoleOverride, a single-doc
// read for exactly the acting user's own role — cheaper than a full
// collection scan on every request).
export async function getAllRoleOverrides(): Promise<Partial<Record<RoleId, Capability[]>>> {
  const db = getAdminFirestore()
  const snap = await db.collection('roleCapabilityOverrides').get()
  const result: Partial<Record<RoleId, Capability[]>> = {}
  for (const doc of snap.docs) {
    result[doc.id as RoleId] = doc.data().capabilities as Capability[]
  }
  return result
}
