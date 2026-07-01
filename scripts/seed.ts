import { getAdminAuth, getAdminFirestore } from '../src/lib/firebase/admin'
import { randomBytes } from 'node:crypto'

async function main() {
  const db = getAdminFirestore()
  const auth = getAdminAuth()

  const branchRef = db.collection('branches').doc()
  await branchRef.set({
    name: 'LFD Services — Main Branch',
    address: 'PLACEHOLDER — update in Branch Management',
    phone: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  console.log('Seeded branch:', branchRef.id)

  const email = process.env.SEED_SUPER_ADMIN_EMAIL
  if (!email) throw new Error('Set SEED_SUPER_ADMIN_EMAIL before running seed')
  const tempPassword = randomBytes(18).toString('base64url')

  const userRecord = await auth.createUser({ email, password: tempPassword, emailVerified: false })
  await auth.setCustomUserClaims(userRecord.uid, {
    role: 'super_admin',
    branchId: branchRef.id,
    superAdmin: true,
  })
  await db.collection('staff').doc(userRecord.uid).set({
    uid: userRecord.uid,
    email,
    name: 'Super Admin',
    role: 'super_admin',
    branchId: branchRef.id,
    department: null,
    contact: { phone: null, address: null },
    emergencyContact: { name: null, phone: null, relationship: null },
    employment: { startDate: new Date(), status: 'active' },
    qualifications: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: userRecord.uid,
  })

  console.log('Seeded super_admin:', email)
  console.log('Temporary password (copy now, not stored anywhere):', tempPassword)
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1) })
