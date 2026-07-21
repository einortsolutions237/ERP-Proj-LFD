import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'

// '/api/auth/login' covers the strict-role router. '/api/auth/session' and
// '/api/auth/login-failed' must also be reachable before a session cookie
// exists (client_sdk login path mints the cookie via /session; login-failed
// reports pre-login failures) — each of those routes independently verifies
// its own input (idToken / best-effort audit write), so exempting them from
// the cookie-presence gate here does not weaken enforcement. '/api/health'
// (Phase 35) is a deliberately unauthenticated uptime-check target — it
// reads nothing and returns nothing but a static ok, so there is no
// enforcement being bypassed by exempting it either.
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/session', '/api/auth/login-failed', '/api/health']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname.startsWith('/_next')) {
    return NextResponse.next()
  }
  const hasCookie = request.cookies.has(SESSION_COOKIE_NAME)
  if (!hasCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
