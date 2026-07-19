import { getAdminFirestore } from '@/lib/firebase/admin'
import type { SessionUser } from '@/lib/auth/server-guard'
import { isBranchLocked } from '@/lib/auth/permissions'
import type { PayrollRecord } from '@/lib/types/payroll'

export class PayrollValidationError extends Error {}

export interface CreatePayrollRecordInput {
  staffId: string
  payPeriodStart: string // 'YYYY-MM-DD'
  payPeriodEnd: string // 'YYYY-MM-DD'
  grossAmount?: number | null
  notes?: string | null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseDateOnly(value: unknown): Date | null {
  if (!isNonEmptyString(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

export async function createPayrollRecord(
  user: SessionUser,
  input: CreatePayrollRecordInput
): Promise<{ id: string; payload: Record<string, unknown> }> {
  if (!isNonEmptyString(input.staffId)) {
    throw new PayrollValidationError('staffId is required')
  }
  const start = parseDateOnly(input.payPeriodStart)
  if (!start) throw new PayrollValidationError('payPeriodStart must be a valid date (YYYY-MM-DD)')
  const end = parseDateOnly(input.payPeriodEnd)
  if (!end) throw new PayrollValidationError('payPeriodEnd must be a valid date (YYYY-MM-DD)')
  if (end.getTime() < start.getTime()) {
    throw new PayrollValidationError('payPeriodEnd must not be before payPeriodStart')
  }
  if (input.grossAmount !== undefined && input.grossAmount !== null) {
    if (typeof input.grossAmount !== 'number' || !isFinite(input.grossAmount) || input.grossAmount <= 0) {
      throw new PayrollValidationError('grossAmount must be a positive number')
    }
  }
  if (input.notes !== undefined && input.notes !== null && typeof input.notes !== 'string') {
    throw new PayrollValidationError('notes must be a string')
  }

  const db = getAdminFirestore()
  const staffSnap = await db.collection('staff').doc(input.staffId.trim()).get()
  if (!staffSnap.exists) {
    throw new PayrollValidationError('staffId does not reference an existing staff member')
  }
  const staffData = staffSnap.data()!

  // grossAmount is a real overridable field (partial months, bonuses,
  // adjustments are normal) — only fall back to the staff member's standing
  // baseSalary when the caller didn't supply one explicitly.
  let grossAmount: number
  if (input.grossAmount !== undefined && input.grossAmount !== null) {
    grossAmount = input.grossAmount
  } else {
    const baseSalary = staffData.baseSalary
    if (typeof baseSalary !== 'number') {
      throw new PayrollValidationError('staff member has no baseSalary set; provide grossAmount explicitly')
    }
    grossAmount = baseSalary
  }

  // Resolved-value check, covering both sources: the explicit-input branch
  // above already validates its raw input early for a precise error message,
  // but the baseSalary fallback only checked typeof — a staff member with
  // baseSalary: 0 (PATCH /api/staff allows it; its validation is `< 0`, so 0
  // passes) would otherwise slip a grossAmount: 0 record past this function.
  if (!isFinite(grossAmount) || grossAmount <= 0) {
    throw new PayrollValidationError('grossAmount must be a positive number')
  }

  // branchId always comes from the staff member's own current branch, never
  // the recording user or a client-supplied value — see the plan's
  // Decision 2: unlike expenses, a payroll record's branch is never
  // ambiguous once staffId is known.
  const branchId = staffData.branchId as string

  const ref = db.collection('payrollRecords').doc()
  const payload = {
    staffId: input.staffId.trim(),
    payPeriodStart: start,
    payPeriodEnd: end,
    grossAmount,
    branchId,
    recordedBy: user.uid,
    createdAt: new Date(),
    notes: input.notes?.trim() || null,
  }
  await ref.set(payload)
  return { id: ref.id, payload }
}

// No view-capable role is branch-locked today, but this stays correct if
// that ever changes — same defensive pattern as buildPnLReport's own
// branch filter. No orderBy in the Firestore query either way — sorted in
// memory instead, same reasoning as queryExpenses avoiding an unnecessary
// composite index for a collection this small.
export async function queryPayrollRecords(user: SessionUser): Promise<PayrollRecord[]> {
  const db = getAdminFirestore()
  const collection = db.collection('payrollRecords')
  const snap = isBranchLocked(user.role)
    ? await collection.where('branchId', '==', user.branchId).get()
    : await collection.get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as PayrollRecord))
    .sort((a, b) => b.payPeriodStart.toMillis() - a.payPeriodStart.toMillis())
}
