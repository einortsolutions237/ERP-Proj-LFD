import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import type { RoleId } from '@/lib/auth/permissions'

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`)
  return res.json()
}

export async function resetEmulator(): Promise<void> {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/default/documents`, {
    method: 'DELETE',
  })
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${projectId}/accounts`, {
    method: 'DELETE',
  })
}

export async function seedBranch(name: string): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('branches').doc()
  await ref.set({ name, address: 'Test address', phone: null, active: true, createdAt: new Date(), updatedAt: new Date() })
  return { id: ref.id }
}

export async function mintSessionCookie(uid: string): Promise<string> {
  const auth = getAdminAuth()
  const customToken = await auth.createCustomToken(uid)
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID!
  const exchange = await fetchJson(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  )
  return auth.createSessionCookie(exchange.idToken, { expiresIn: 60 * 60 * 1000 })
}

export async function seedStaff(input: { role: RoleId; branchId: string; email: string; baseSalary?: number | null }): Promise<{ uid: string; sessionCookie: string }> {
  const auth = getAdminAuth()
  const db = getAdminFirestore()
  const userRecord = await auth.createUser({ email: input.email, password: 'Test-password-1!', emailVerified: true })
  await auth.setCustomUserClaims(userRecord.uid, { role: input.role, branchId: input.branchId })
  await db.collection('staff').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email: input.email,
    name: `Test ${input.role}`,
    role: input.role,
    branchId: input.branchId,
    department: null,
    contact: { phone: null, address: null },
    emergencyContact: { name: null, phone: null, relationship: null },
    employment: { startDate: new Date(), status: 'active' },
    qualifications: [],
    baseSalary: input.baseSalary ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: userRecord.uid,
  })
  const sessionCookie = await mintSessionCookie(userRecord.uid)
  return { uid: userRecord.uid, sessionCookie }
}

export async function seedProduct(input: { name: string; price: number; active?: boolean; reorderThreshold?: number; unitCost?: number }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('products').doc()
  await ref.set({
    name: input.name,
    price: input.price,
    active: input.active ?? true,
    sku: `SKU-${ref.id}`,
    unitCost: input.unitCost ?? 0,
    reorderThreshold: input.reorderThreshold ?? 5,
    supplierId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return { id: ref.id }
}

export async function seedProductStock(input: { branchId: string; productId: string; quantity: number }): Promise<void> {
  const db = getAdminFirestore()
  await db.collection('productStock').doc(`${input.branchId}_${input.productId}`).set({
    branchId: input.branchId,
    productId: input.productId,
    quantity: input.quantity,
    updatedAt: new Date(),
  })
}

export async function seedCustomer(input: { name: string; phone: string }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('customers').doc()
  await ref.set({ name: input.name, phone: input.phone, email: null, address: null, notes: null, createdAt: new Date(), updatedAt: new Date() })
  return { id: ref.id }
}

export async function seedSale(input: { branchId: string; total: number; createdAt: Date; voidedAt?: Date | null }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('sales').doc()
  await ref.set({
    branchId: input.branchId,
    lineItems: [],
    subtotal: input.total,
    discountAmount: 0,
    taxAmount: 0,
    total: input.total,
    payments: [{ method: 'cash', amount: input.total, reference: null }],
    cashierUid: 'test-cashier',
    customerId: null,
    clientIdempotencyKey: null,
    voidedAt: input.voidedAt ?? null,
    voidedBy: input.voidedAt ? 'test-voider' : null,
    voidReason: input.voidedAt ? 'test void' : null,
    createdAt: input.createdAt,
  })
  return { id: ref.id }
}

export async function seedPendingDelivery(input: { branchId: string; productId: string; customerId: string; saleId: string; status?: 'pending' | 'fulfilled'; createdAt?: Date }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('pendingDeliveries').doc()
  await ref.set({
    saleId: input.saleId,
    productId: input.productId,
    customerId: input.customerId,
    branchId: input.branchId,
    quantityOwed: 2,
    status: input.status ?? 'pending',
    fulfilledBy: null,
    fulfilledAt: null,
    createdAt: input.createdAt ?? new Date(),
  })
  return { id: ref.id }
}

export async function seedAuditLogEntry(input: { action: string; branchId: string | null; createdAt: Date; actorEmail?: string }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('auditLogs').doc()
  await ref.set({
    action: input.action,
    actorUid: 'test-actor',
    actorEmail: input.actorEmail ?? 'actor@test.local',
    targetUid: null,
    branchId: input.branchId,
    details: null,
    createdAt: input.createdAt,
  })
  return { id: ref.id }
}

export async function seedLeaveRequest(input: { staffId: string; branchId: string; type: 'annual' | 'sick' | 'unpaid' | 'other'; status?: 'pending' | 'approved' | 'rejected'; startDate?: Date; endDate?: Date; createdAt?: Date }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('leaveRequests').doc()
  const start = input.startDate ?? new Date()
  const end = input.endDate ?? new Date(start.getTime() + 86400000)
  await ref.set({
    staffId: input.staffId,
    branchId: input.branchId,
    type: input.type,
    startDate: start,
    endDate: end,
    reason: null,
    status: input.status ?? 'pending',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: input.createdAt ?? new Date(),
  })
  return { id: ref.id }
}

export async function seedExpense(input: { branchId: string; date: Date; category: string; amount: number; description?: string; recordedBy?: string }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('expenses').doc()
  await ref.set({
    date: input.date,
    category: input.category,
    amount: input.amount,
    description: input.description ?? 'Test expense',
    branchId: input.branchId,
    recordedBy: input.recordedBy ?? 'test-finance-admin',
    createdAt: new Date(),
  })
  return { id: ref.id }
}

export async function seedPayrollRecord(input: { staffId: string; branchId: string; payPeriodStart: Date; payPeriodEnd: Date; grossAmount: number; recordedBy?: string; notes?: string | null }): Promise<{ id: string }> {
  const db = getAdminFirestore()
  const ref = db.collection('payrollRecords').doc()
  await ref.set({
    staffId: input.staffId,
    payPeriodStart: input.payPeriodStart,
    payPeriodEnd: input.payPeriodEnd,
    grossAmount: input.grossAmount,
    branchId: input.branchId,
    recordedBy: input.recordedBy ?? 'test-finance-admin',
    createdAt: new Date(),
    notes: input.notes ?? null,
  })
  return { id: ref.id }
}
