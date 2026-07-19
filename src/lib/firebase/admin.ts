import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

function getAdminApp(): App {
  if (getApps().length) return getApp()
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

// This project's Firestore database was provisioned with the explicit
// database ID "default" (Firestore Enterprise edition's creation flow
// requires naming a database — it does not offer the SDK's implicit,
// specially-reserved "(default)" database). getFirestore(app) with no
// second argument targets "(default)" and fails with NOT_FOUND against
// this project — the ID must be passed explicitly.
const FIRESTORE_DATABASE_ID = 'default'

export function getAdminFirestore() {
  return getFirestore(getAdminApp(), FIRESTORE_DATABASE_ID)
}

export function getAdminStorage() {
  return getStorage(getAdminApp())
}
