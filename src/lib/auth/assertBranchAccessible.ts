import { notFound } from 'next/navigation'
import { isBranchLocked, type RoleId } from './permissions'

// Shared by every Server Component page that resolves a single branch-scoped
// document by ID (staff, departments, ...): a branch-locked role is
// restricted to its own branch, a non-branch-locked role is org-wide.
// Calling notFound() rather than returning a boolean doubles as "don't
// reveal that the record exists in another branch" via the same 404 as a
// genuinely missing doc, matching the PATCH/DELETE routes for the same
// collections. This exact unconditional-branchId-check bug (missing the
// isBranchLocked gate entirely) has been found and fixed independently
// eight times across this project's history — this helper exists so the
// ninth instance can't be introduced by copy-pasting the check wrong again.
export function assertBranchAccessible(role: RoleId, recordBranchId: string, viewerBranchId: string): void {
  if (isBranchLocked(role) && recordBranchId !== viewerBranchId) notFound()
}
