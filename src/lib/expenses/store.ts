import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import type { Expense } from '@/lib/types/expense'

export class ExpenseValidationError extends Error {}

export interface CreateExpenseInput {
  date: string // 'YYYY-MM-DD'
  category: string
  amount: number
  description: string
  branchId?: string | null
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
export async function queryExpenses(user: SessionUser): Promise<Expense[]> {
  const db = getAdminFirestore()
  const collection = db.collection('expenses')
  const snap = isBranchLocked(user.role)
    ? await collection.where('branchId', '==', user.branchId).get()
    : await collection.get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Expense))
    .sort((a, b) => b.date.toMillis() - a.date.toMillis())
}
