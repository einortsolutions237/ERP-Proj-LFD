import { describe, it, expect, beforeAll } from 'vitest'
import { resetEmulator, seedBranch, seedAuditLogEntry } from '../setup/fixtures'
import { getRecentActivity, DASHBOARD_ACTIVITY_ACTIONS } from '@/lib/dashboard/recentActivity'
import type { SessionUser } from '@/lib/auth/server-guard'

describe('getRecentActivity', () => {
  let branchA: string
  let branchB: string
  let branchManagerUser: SessionUser
  let generalManagerUser: SessionUser
  let cashierUser: SessionUser

  beforeAll(async () => {
    await resetEmulator()
    const a = await seedBranch('Dashboard Recent Activity Branch A')
    const b = await seedBranch('Dashboard Recent Activity Branch B')
    branchA = a.id
    branchB = b.id
    branchManagerUser = { uid: 'dashboard-activity-bm', email: 'bm@test.local', role: 'branch_manager', branchId: branchA }
    generalManagerUser = { uid: 'dashboard-activity-gm', email: 'gm@test.local', role: 'general_manager', branchId: branchA }
    cashierUser = { uid: 'dashboard-activity-cashier', email: 'cash@test.local', role: 'cashier', branchId: branchA }

    // IMPORTANT: use timestamps AHEAD of "now", not behind it. getRecentActivity
    // fetches only the most recent 300 auditLogs entries (RESULT_LIMIT caps at
    // 10 matches) ordered by createdAt desc. This integration suite shares one
    // Firestore emulator across concurrently-run test files, and several other
    // files (sales.test.ts in particular) write real auditLogs entries — some
    // with whitelisted actions like sale_create — at real wall-clock "now"
    // while this file's beforeAll runs. If this test's own fixture entries were
    // backdated (now minus N seconds), they would sort BEHIND those concurrent
    // real-time writes and could be pushed out of the top-10 cap, making this
    // test's own assertions fail nondeterministically depending on what else
    // is running. Placing this test's entries slightly in the FUTURE guarantees
    // they sort ahead of anything else being written around the same moment,
    // regardless of what other files are doing concurrently — this is the
    // same class of cross-file-emulator-concurrency hazard already found and
    // fixed in Tasks 2/3 (see their commits), applied here proactively.
    const now = new Date()
    const t = (secondsAhead: number) => new Date(now.getTime() + secondsAhead * 1000)

    await seedAuditLogEntry({ action: 'sale_create', branchId: branchA, createdAt: t(10) }) // whitelisted, branch A
    await seedAuditLogEntry({ action: 'sale_create', branchId: branchB, createdAt: t(20) }) // whitelisted, branch B
    await seedAuditLogEntry({ action: 'product_edit', branchId: null, createdAt: t(30) }) // whitelisted, org-wide (null branchId)
    await seedAuditLogEntry({ action: 'login', branchId: branchA, createdAt: t(35) }) // NOT whitelisted (security telemetry)
    await seedAuditLogEntry({ action: 'clinical_record_view', branchId: branchA, createdAt: t(39) }) // NOT whitelisted (clinical wall)
  })

  it('exports the exact approved whitelist', () => {
    expect(DASHBOARD_ACTIVITY_ACTIONS.slice().sort()).toEqual(
      [
        'sale_create', 'sale_void', 'stock_adjust', 'stock_transfer', 'pending_delivery_fulfilled',
        'staff_create', 'staff_edit', 'staff_delete', 'permission_change',
        'product_create', 'product_edit', 'product_delete',
        'service_create', 'service_edit', 'service_delete',
        'supplier_create', 'supplier_edit', 'supplier_delete',
        'customer_create', 'customer_edit', 'customer_delete',
        'leave_request_create',
      ].sort()
    )
  })

  it('branch_manager sees own-branch entries plus org-wide (null branchId) entries, never another branch\'s, and never a non-whitelisted action', async () => {
    const items = await getRecentActivity(branchManagerUser)
    const actions = items.map((i) => i.action)
    expect(actions).toContain('sale_create')
    expect(actions).toContain('product_edit') // org-wide entry, visible to branch_manager
    expect(actions).not.toContain('login')
    expect(actions).not.toContain('clinical_record_view')
    expect(items.some((i) => i.branchId === branchB)).toBe(false) // never another branch's entry
  })

  it('general_manager sees whitelisted entries from every branch, unfiltered', async () => {
    const items = await getRecentActivity(generalManagerUser)
    const actions = items.map((i) => i.action)
    expect(items.some((i) => i.branchId === branchA)).toBe(true)
    expect(items.some((i) => i.branchId === branchB)).toBe(true)
    expect(actions).not.toContain('login')
    expect(actions).not.toContain('clinical_record_view')
  })

  it('rejects cashier, which does not hold dashboard.activity.view', async () => {
    await expect(getRecentActivity(cashierUser)).rejects.toThrow('Forbidden')
  })
})
