export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

export function isSecureEnvironment(): boolean {
  return process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: isSecureEnvironment(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
