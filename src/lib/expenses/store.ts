import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import type { Expense } from '@/lib/types/expense'
import type { Attachment } from '@/lib/types/attachment'

export class ExpenseValidationError extends Error {}

export interface CreateExpenseInput {
  date: string // 'YYYY-MM-DD'
  category: string
  amount: number
  description: string
  branchId?: string | null
}

export interface ExpenseAttachmentRow {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

// Attachments are never stored on the expense document itself — same as
// labResults/labOrders (see getLabRecords.ts). This is the read-side join
// queryExpenses resolves, not a field on the raw Expense document, so
// pnl.ts's direct `doc.data() as Expense` cast stays correct and untouched.
export interface ExpenseRow extends Expense {
  attachments: ExpenseAttachmentRow[]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Mirrors POST /api/departments' branchId resolution exactly: a
// branch-locked role's own branchId is used unconditionally; a
// non-branch-locked role may target any real branch, validated against a
// live branches doc.
export async function resolveExpenseBranchId(user: SessionUser, requestedBranchId: unknown): Promise<string> {
  if (isBranchLocked(user.role)) return user.branchId
  if (requestedBranchId === undefined || requestedBranchId === null) return user.branchId
  if (!isNonEmptyString(requestedBranchId)) {
    throw new ExpenseValidationError('branchId must be a non-empty string')
  }
  const db = getAdminFirestore()
  const branchSnap = await db.collection('branches').doc(requestedBranchId.trim()).get()
  if (!branchSnap.exists) {
    throw new ExpenseValidationError('branchId does not reference an existing branch')
  }
  return requestedBranchId.trim()
}

export async function createExpense(
  user: SessionUser,
  input: CreateExpenseInput
): Promise<{ id: string; payload: Record<string, unknown> }> {
  if (!isNonEmptyString(input.date) || isNaN(new Date(`${input.date}T00:00:00.000Z`).getTime())) {
    throw new ExpenseValidationError('date must be a valid date (YYYY-MM-DD)')
  }
  if (!isNonEmptyString(input.category)) {
    throw new ExpenseValidationError('category is required')
  }
  if (typeof input.amount !== 'number' || !isFinite(input.amount) || input.amount <= 0) {
    throw new ExpenseValidationError('amount must be a positive number')
  }
  if (!isNonEmptyString(input.description)) {
    throw new ExpenseValidationError('description is required')
  }

  const branchId = await resolveExpenseBranchId(user, input.branchId)

  const db = getAdminFirestore()
  const ref = db.collection('expenses').doc()
  const payload = {
    date: new Date(`${input.date}T00:00:00.000Z`),
    category: input.category.trim(),
    amount: input.amount,
    description: input.description.trim(),
    branchId,
    recordedBy: user.uid,
    createdAt: new Date(),
  }
  await ref.set(payload)
  return { id: ref.id, payload }
}

// No orderBy in the Firestore query — combining the branchId equality
// filter with orderBy('date') on a different field would need a new
// composite index. Sorted in memory instead, same reasoning as avoiding an
// unnecessary index for a collection this small.
//
// Phase 30.2: also resolves each expense's own receipt attachments (Phase
// 30's generic attachments collection, filtered to relatedCollection ===
// 'expenses') at this same call site, mirroring getLabRecords.ts's Phase
// 30.1 pattern — no new route, no new capability check, since
// accounting.expense.view already gates every caller of this function.
export async function queryExpenses(user: SessionUser): Promise<ExpenseRow[]> {
  const db = getAdminFirestore()
  const collection = db.collection('expenses')
  const snap = isBranchLocked(user.role)
    ? await collection.where('branchId', '==', user.branchId).get()
    : await collection.get()
  const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense))

  // Attachments per expense — sorted in memory (not via .orderBy) to avoid
  // needing a new Firestore composite index for what's always a short list.
  const attachmentSnaps = await Promise.all(
    expenses.map((expense) =>
      db
        .collection('attachments')
        .where('relatedCollection', '==', 'expenses')
        .where('relatedDocId', '==', expense.id)
        .get()
    )
  )
  const attachmentsByExpenseId: Record<string, ExpenseAttachmentRow[]> = {}
  expenses.forEach((expense, i) => {
    attachmentsByExpenseId[expense.id] = attachmentSnaps[i].docs
      .map((d) => {
        const a = d.data() as Attachment
        return {
          id: d.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt.toDate().toISOString(),
        }
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  })

  return expenses
    .map((expense) => ({ ...expense, attachments: attachmentsByExpenseId[expense.id] }))
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())
}
