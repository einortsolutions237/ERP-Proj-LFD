import { describe, it, expect } from 'vitest'
import {
  ROLES,
  ROLE_CAPABILITIES,
  BRANCH_LOCKED_ROLES,
  hasCapability,
  isBranchLocked,
  type Capability,
  type RoleId,
} from '@/lib/auth/permissions'

const CAPABILITIES = Object.keys(ROLE_CAPABILITIES) as Capability[]

describe('role x capability matrix', () => {
  it('matches the exact grant table for every role x every capability', () => {
    const matrix: Record<string, Record<string, boolean>> = {}
    for (const role of ROLES) {
      matrix[role] = {}
      for (const capability of CAPABILITIES) {
        matrix[role][capability] = hasCapability(role, capability)
      }
    }
    expect(matrix).toMatchSnapshot()
  })

  it('super_admin holds every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(hasCapability('super_admin', capability)).toBe(true)
    }
  })

  it('clinical.record.create is exactly [super_admin, doctor]', () => {
    expect(ROLE_CAPABILITIES['clinical.record.create'].slice().sort()).toEqual(['doctor', 'super_admin'])
  })

  it('general_manager does not hold crm.customer.view (no commercial view)', () => {
    expect(hasCapability('general_manager', 'crm.customer.view')).toBe(false)
  })

  it('general_manager does not hold clinical.record.create (no clinical authoring)', () => {
    expect(hasCapability('general_manager', 'clinical.record.create')).toBe(false)
  })

  it('general_manager does not hold seminars.attendance.record (no attendance recording)', () => {
    expect(hasCapability('general_manager', 'seminars.attendance.record')).toBe(false)
  })

  it('branch-locked roles are exactly [branch_manager, cashier, inventory_manager]', () => {
    expect(BRANCH_LOCKED_ROLES.slice().sort()).toEqual(['branch_manager', 'cashier', 'inventory_manager'])
    for (const role of ROLES) {
      expect(isBranchLocked(role)).toBe(BRANCH_LOCKED_ROLES.includes(role))
    }
  })

  it('admin holds exactly its nine granted capabilities: five Phase 17 system/access-administration items, three universal ALL_ROLES items, and clinical.questionnaire.manage', () => {
    const adminCapabilities = CAPABILITIES.filter((c) => hasCapability('admin', c)).sort()
    expect(adminCapabilities).toEqual([
      'admin.auditLog.view',
      'admin.roles.assign',
      'admin.roles.view',
      'admin.settings.manage',
      'admin.staff.create',
      'clinical.questionnaire.manage',
      'hr.attendance.self',
      'hr.leave.request',
      'messaging.access',
    ])
  })

  it('admin holds no deep clinical capability (diagnosis/treatment/appointments/lab/intake) despite holding clinical.questionnaire.manage', () => {
    const deepClinicalCapabilities: Capability[] = [
      'clinical.record.create',
      'clinical.record.view',
      'clinical.appointments.manage',
      'clinical.lab.order',
      'clinical.lab.results.enter',
      'clinical.lab.view',
      'clinical.intake.record',
      'clinical.intake.view',
    ]
    for (const capability of deepClinicalCapabilities) {
      expect(hasCapability('admin', capability)).toBe(false)
    }
    // The one deliberate exception: template configuration is a
    // business-operations concern, not clinical authoring (Phase 19.1).
    expect(hasCapability('admin', 'clinical.questionnaire.manage')).toBe(true)
  })

  it('lab_staff holds clinical.lab.results.enter and clinical.lab.view but not clinical.lab.order', () => {
    expect(hasCapability('lab_staff', 'clinical.lab.results.enter')).toBe(true)
    expect(hasCapability('lab_staff', 'clinical.lab.view')).toBe(true)
    expect(hasCapability('lab_staff', 'clinical.lab.order')).toBe(false)
  })

  it('nurse holds clinical.intake.record/view but not clinical.record.view/appointments/lab.order', () => {
    expect(hasCapability('nurse', 'clinical.intake.record')).toBe(true)
    expect(hasCapability('nurse', 'clinical.intake.view')).toBe(true)
    expect(hasCapability('nurse', 'clinical.record.view')).toBe(false)
    expect(hasCapability('nurse', 'clinical.appointments.manage')).toBe(false)
    expect(hasCapability('nurse', 'clinical.lab.order')).toBe(false)
  })

  it('dashboard.activity.view is exactly [super_admin, general_manager, branch_manager]', () => {
    expect(ROLE_CAPABILITIES['dashboard.activity.view'].slice().sort()).toEqual(['branch_manager', 'general_manager', 'super_admin'])
  })

  it('dashboard.activity.view is not held by cashier, admin, finance_admin, or any clinical/lab/seminar role', () => {
    const excluded: RoleId[] = ['cashier', 'admin', 'finance_admin', 'hr_admin', 'it_admin', 'doctor', 'medical_secretary', 'protocol', 'nurse', 'lab_staff', 'inventory_manager']
    for (const role of excluded) {
      expect(hasCapability(role, 'dashboard.activity.view')).toBe(false)
    }
  })

  it('nurse does not hold clinical.appointments.manage (dashboard visibility must not widen scheduling access)', () => {
    expect(hasCapability('nurse', 'clinical.appointments.manage')).toBe(false)
  })

  it('accounting.expense.create is exactly [super_admin, finance_admin]', () => {
    expect(ROLE_CAPABILITIES['accounting.expense.create'].slice().sort()).toEqual(['finance_admin', 'super_admin'])
  })

  it('accounting.expense.view and accounting.pnl.view are both exactly [super_admin, finance_admin, general_manager]', () => {
    expect(ROLE_CAPABILITIES['accounting.expense.view'].slice().sort()).toEqual(['finance_admin', 'general_manager', 'super_admin'])
    expect(ROLE_CAPABILITIES['accounting.pnl.view'].slice().sort()).toEqual(['finance_admin', 'general_manager', 'super_admin'])
  })

  it('general_manager can view expenses/P&L but cannot record an expense', () => {
    expect(hasCapability('general_manager', 'accounting.expense.view')).toBe(true)
    expect(hasCapability('general_manager', 'accounting.pnl.view')).toBe(true)
    expect(hasCapability('general_manager', 'accounting.expense.create')).toBe(false)
  })

  it('no non-accounting role holds any of the three accounting capabilities', () => {
    const excluded: RoleId[] = ['admin', 'branch_manager', 'cashier', 'hr_admin', 'it_admin', 'doctor', 'medical_secretary', 'protocol', 'nurse', 'lab_staff', 'inventory_manager']
    for (const role of excluded) {
      expect(hasCapability(role, 'accounting.expense.create')).toBe(false)
      expect(hasCapability(role, 'accounting.expense.view')).toBe(false)
      expect(hasCapability(role, 'accounting.pnl.view')).toBe(false)
    }
  })
})
