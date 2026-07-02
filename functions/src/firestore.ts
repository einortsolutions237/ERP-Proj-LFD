import { initializeApp, getApps, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Inside the Cloud Functions runtime, initializeApp() with no args picks up
// the environment's implicit default credentials (unlike the Next.js app on
// Vercel, which needs an explicit cert() — see src/lib/firebase/admin.ts).
function getFunctionsApp() {
  if (getApps().length) return getApp()
  return initializeApp()
}

// This project's Firestore database has the explicit name "default", not the
// SDK's implicit "(default)" — same reason src/lib/firebase/admin.ts passes
// this second argument. Every trigger's own registration must ALSO pass
// database: 'default' in its options (later tasks) — this Firestore client
// alone is not enough to make a trigger fire against the right database.
export function getFunctionsFirestore() {
  return getFirestore(getFunctionsApp(), 'default')
}
