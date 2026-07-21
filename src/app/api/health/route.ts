import { NextResponse } from 'next/server'

// Deliberately no auth check and no Firestore/Firebase read — this exists
// solely as an uptime-check target (Phase 35), so it can only ever reflect
// whether the deployed app process itself is up, never a downstream
// dependency hiccup being mistaken for an outage.
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
