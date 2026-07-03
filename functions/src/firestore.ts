import { initializeApp, getApps, type App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Inside the Cloud Functions runtime, initializeApp() with no args picks up
// the environment's implicit default credentials (unlike the Next.js app on
// Vercel, which needs an explicit cert() — see src/lib/firebase/admin.ts).
//
// Deliberately NOT getApp() here: confirmed live (2026-07-03 functional
// test) that the Cloud Functions v2 runtime can have a pre-existing
// registered app that ISN'T named "[DEFAULT]" — getApps().length is then
// truthy, but getApp() (which looks up "[DEFAULT]" specifically) throws
// "The default Firebase app does not exist" even though an app is present.
// Grabbing getApps()[0] sidesteps the name lookup entirely.
function getFunctionsApp(): App {
  const existing = getApps()
  return existing.length > 0 ? existing[0] : initializeApp()
}

// This project's Firestore database has the explicit name "default", not the
// SDK's implicit "(default)" — same reason src/lib/firebase/admin.ts passes
// this second argument. Every trigger's own registration must ALSO pass
// database: 'default' in its options (later tasks) — this Firestore client
// alone is not enough to make a trigger fire against the right database.
export function getFunctionsFirestore() {
  return getFirestore(getFunctionsApp(), 'default')
}
