// scripts/phase37-cleanup-test-customers.ts
import { getAdminFirestore } from '../src/lib/firebase/admin'
import { writeAuditLog } from '../src/lib/audit/log'

const TARGET_NAMES = ['Lab Test Only Customer', 'Phase 18 Verification Customer']

const REFERENCE_COLLECTIONS = ['sales', 'treatments', 'appointments', 'labOrders', 'seminarAttendance'] as const
const CLEANUP_COLLECTIONS = ['pendingDeliveries'] as const

async function main() {
  const db = getAdminFirestore()

  for (const name of TARGET_NAMES) {
    const custSnap = await db.collection('customers').where('name', '==', name).get()
    if (custSnap.empty) {
      console.log(`[skip] no customer found named "${name}"`)
      continue
    }

    for (const custDoc of custSnap.docs) {
      const id = custDoc.id
      console.log(`\n=== "${name}" (${id}) ===`)

      const blockers: string[] = []
      for (const col of REFERENCE_COLLECTIONS) {
        const refSnap = await db.collection(col).where('customerId', '==', id).limit(1).get()
        if (!refSnap.empty) blockers.push(col)
      }

      if (blockers.length > 0) {
        console.log(`[BLOCKED] referenced by: ${blockers.join(', ')} — this app never allows deleting those collections. STOPPING for this customer; report back for a decision rather than deleting.`)
        continue
      }

      for (const col of CLEANUP_COLLECTIONS) {
        const refSnap = await db.collection(col).where('customerId', '==', id).get()
        for (const doc of refSnap.docs) {
          console.log(`[delete] ${col}/${doc.id}`)
          await doc.ref.delete()
        }
      }

      console.log(`[delete] customers/${id}`)
      await custDoc.ref.delete()
      await writeAuditLog({
        action: 'customer_delete',
        actorUid: null,
        actorEmail: 'phase37-cleanup-script',
        targetUid: id,
        branchId: null,
        details: { reason: 'Phase 37 Fix 6 — leftover QA test customer removed from live checkout picker' },
      })
      console.log(`[done] "${name}" removed`)
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
