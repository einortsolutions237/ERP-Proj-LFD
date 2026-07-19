import type { Capability } from '@/lib/auth/permissions'

// The one place that knows which collections can have attachments, and
// which capability gates managing (uploading to) vs. viewing each one.
// Phase 30.1 (lab scans) and 30.2 (expense receipts) both read from this
// map rather than each inventing their own capability lookup — adding a
// third attachable collection later means adding one entry here, nothing
// else in the foundation changes.
export type AttachableCollection = 'labResults' | 'expenses'

// Two invariants a new entry should respect, neither enforced by the type
// system:
// 1. For both entries below, every role holding `manage` also holds `view`
//    (manage ⊆ view) — there's no "can upload but can't view" case today.
//    If a future collection's roles don't nest this way, GET's behavior
//    (view-gated only) still does the right thing; just don't assume manage
//    implies view when adding new UI on top of this.
// 2. GET /api/attachments/[id] gates on `view` only — it does not also
//    check the attachment's stored `branchId`. That's correct today because
//    no role holding either `view` capability below is branch-locked
//    (`isBranchLocked`), and neither related collection is meaningfully
//    branch-scoped for viewing purposes. A future attachable collection
//    that combines branch-locked viewers with branch-scoped records would
//    need an explicit branchId check added to the GET route, not just an
//    entry here.
export const ATTACHMENT_CAPABILITIES: Record<AttachableCollection, { manage: Capability; view: Capability }> = {
  labResults: { manage: 'clinical.lab.results.enter', view: 'clinical.lab.view' },
  expenses: { manage: 'accounting.expense.create', view: 'accounting.expense.view' },
}

export function isAttachableCollection(value: string): value is AttachableCollection {
  return value in ATTACHMENT_CAPABILITIES
}
