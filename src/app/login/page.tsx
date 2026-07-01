'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Always try the router first — it decides server-verified vs. client SDK
    // based on the account's role, per Design Decision #1.
    let routeRes: Response
    let routeBody: { ok?: boolean; error?: string; strategy?: string } = {}
    try {
      routeRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      // A non-JSON body (e.g. Next.js's default error page on an unhandled
      // server exception) must not crash the form — fall back to a generic error.
      routeBody = await routeRes.json().catch(() => ({}))
    } catch {
      setError('Login failed. Please try again.')
      return
    }

    if (routeRes.ok && routeBody.ok) {
      router.push('/dashboard') // strict path: session already minted
      return
    }
    if (!routeRes.ok) {
      setError(routeBody.error ?? 'Login failed') // strict path: verified and rejected
      return
    }
    // routeBody.strategy === 'client_sdk' — fall through to client-side sign-in

    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
      const idToken = await credential.user.getIdToken()

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Login failed')
        return
      }
      router.push('/dashboard')
    } catch {
      // Firebase Auth rejected the credentials (wrong password, disabled user, etc.) —
      // report it for the audit log, but this is best-effort: see Design Decision #1.
      fetch('/api/auth/login-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      }).catch(() => {})
      setError('Invalid credentials')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-24 space-y-4">
      <h1 className="text-xl font-semibold">LFD Services — Sign in</h1>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border rounded px-3 py-2" />
      <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full border rounded px-3 py-2" />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" className="w-full bg-black text-white rounded px-3 py-2">Sign in</button>
    </form>
  )
}
