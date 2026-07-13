import { getAdminFirestore } from '@/lib/firebase/admin'
import { hasCapability, isBranchLocked } from '@/lib/auth/permissions'
import { AuthError, type SessionUser } from '@/lib/auth/server-guard'
import type { AuditAction, AuditLogEntry } from '@/lib/types/audit'

// Curated, business-relevant subset of AuditAction — approved in the Phase 23
// design doc. Deliberately excludes every clinical/lab/appointment/intake/
// seminar-attendance/messaging action (patient- or private-communication-
// adjacent, walled off from branch_manager/general_manager everywhere else
// in this app) and login/login_failed/logout (security telemetry, not
// business activity).
export const DASHBOARD_ACTIVITY_ACTIONS: AuditAction[] = [
  'sale_create', 'sale_void', 'stock_adjust', 'stock_transfer', 'pending_delivery_fulfilled',
  'staff_create', 'staff_edit', 'staff_delete', 'permission_change',
  'product_create', 'product_edit', 'product_delete',
  'service_create', 'service_edit', 'service_delete',
  'supplier_create', 'supplier_edit', 'supplier_delete',
  'customer_create', 'customer_edit', 'customer_delete',
  'leave_request_create',
]

const ACTIVITY_ACTION_SET = new Set<AuditAction>(DASHBOARD_ACTIVITY_ACTIONS)

export interface RecentActivityItem {
  id: string
  action: AuditAction
  actorEmail: string | null
  branchId: string | null
  createdAt: string
}

// Deliberately avoids a where('action','in',[...]).where('branchId','in',[...])
// query — Firestore forbids two 'in' clauses in one query, and that shape
// would need a new composite index. Instead: fetch the most recent ~300
// auditLogs entries (single-field orderBy, already indexed automatically,
// no new index needed) and filter in-memory. Trade-off: if a branch's most
// recent matching action falls outside this 300-entry global window, it
// won't surface here — acceptable for a "recent activity" widget, not
// acceptable if this function is ever repurposed as a report.
const RECENT_WINDOW_SIZE = 300
const RESULT_LIMIT = 10

export async function getRecentActivity(viewer: SessionUser): Promise<RecentActivityItem[]> {
  if (!hasCapability(viewer.role, 'dashboard.activity.view')) {
    throw new AuthError('Forbidden', 403)
  }

  const db = getAdminFirestore()
  const snap = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(RECENT_WINDOW_SIZE).get()

  const branchLocked = isBranchLocked(viewer.role)
  const items: RecentActivityItem[] = []
  for (const doc of snap.docs) {
    const entry = doc.data() as AuditLogEntry
    if (!ACTIVITY_ACTION_SET.has(entry.action)) continue
    if (branchLocked && entry.branchId !== viewer.branchId && entry.branchId !== null) continue
    items.push({
      id: doc.id,
      action: entry.action,
      actorEmail: entry.actorEmail,
      branchId: entry.branchId,
      createdAt: entry.createdAt.toDate().toISOString(),
    })
    if (items.length >= RESULT_LIMIT) break
  }

  return items
}
