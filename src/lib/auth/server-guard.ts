import { cookies } from 'next/headers'
import { getAdminAuth } from '@/lib/firebase/admin'
import { SESSION_COOKIE_NAME } from './session'
import { hasEffectiveCapability, type Capability, type RoleId } from './permissions'
import { getRoleOverride } from './roleOverrides'

export interface SessionUser {
  uid: string
  email: string
  role: RoleId
  branchId: string
  // Phase 39 — null means no override exists for this role; the
  // hardcoded default applies. Resolved once per request, here, so
  // hasEffectiveCapability never needs to be async at any of its call
  // sites.
  effectiveCapabilities: Capability[] | null
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.status = status
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionCookie) return null

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true)
    if (!decoded.role || !decoded.branchId) return null
    const role = decoded.role as RoleId
    const effectiveCapabilities = await getRoleOverride(role)
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      role,
      branchId: decoded.branchId as string,
      effectiveCapabilities,
    }
  } catch {
    return null
  }
}

export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!hasEffectiveCapability(user, capability)) throw new AuthError('Forbidden', 403)
  return user
}

export async function requireAnyCapability(capabilities: Capability[]): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!capabilities.some((c) => hasEffectiveCapability(user, c))) throw new AuthError('Forbidden', 403)
  return user
}
