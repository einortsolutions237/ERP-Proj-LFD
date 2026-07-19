import type { Capability } from '@/lib/auth/permissions'

// The one place that knows which collections can have attachments, and
// which capability gates managing (uploading to) vs. viewing each one.
// Phase 30.1 (lab scans) and 30.2 (expense receipts) both read from this
// map rather than each inventing their own capability lookup — adding a
// third attachable collection later means adding one entry here, nothing
// else in the foundation changes.
export type AttachableCollection = 'labResults' | 'expenses'

export const ATTACHMENT_CAPABILITIES: Record<AttachableCollection, { manage: Capability; view: Capability }> = {
  labResults: { manage: 'clinical.lab.results.enter', view: 'clinical.lab.view' },
  expenses: { manage: 'accounting.expense.create', view: 'accounting.expense.view' },
}

export function isAttachableCollection(value: string): value is AttachableCollection {
  return value in ATTACHMENT_CAPABILITIES
}
