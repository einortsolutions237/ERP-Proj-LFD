import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(__dirname, '../../.env.test')
const lines = readFileSync(envPath, 'utf-8').split('\n')
for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
  process.env[key] = value
}

// REST transport avoids a gRPC/Java-emulator connection-reset issue seen on
// Windows with the default transport. Must be set before any other Firestore
// call in this test file's (isolated) module registry — see
// firestore.test.rules for why REST also needs permissive emulator rules.
const { getAdminFirestore } = await import('@/lib/firebase/admin')
getAdminFirestore().settings({ preferRest: true })
