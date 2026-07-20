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
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

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
      setSubmitting(false)
      return
    }

    if (routeRes.ok && routeBody.ok) {
      router.push('/dashboard') // strict path: session already minted
      return
    }
    if (!routeRes.ok) {
      setError(routeBody.error ?? 'Login failed') // strict path: verified and rejected
      setSubmitting(false)
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
        setSubmitting(false)
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
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="font-display text-xl font-semibold text-ink">LFD Services — Sign in</h1>
      <div>
        <label htmlFor="login-email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-mist bg-paper px-3 py-2 text-ink placeholder:text-slate focus:border-marine"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 w-full rounded-lg bg-marine px-3 text-paper transition-opacity duration-200 disabled:opacity-50"
      >
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
