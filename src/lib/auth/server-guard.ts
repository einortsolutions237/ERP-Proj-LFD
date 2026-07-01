import { cookies } from 'next/headers'
import { getAdminAuth } from '@/lib/firebase/admin'
import { SESSION_COOKIE_NAME } from './session'
import { hasCapability, type Capability, type RoleId } from './permissions'

export interface SessionUser {
  uid: string
  email: string
  role: RoleId
  branchId: string
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
    return {
      uid: decoded.uid,
      email: decoded.email ?? '',
      role: decoded.role as RoleId,
      branchId: decoded.branchId as string,
    }
  } catch {
    return null
  }
}

export async function requireCapability(capability: Capability): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new AuthError('Not signed in', 401)
  if (!hasCapability(user.role, capability)) throw new AuthError('Forbidden', 403)
  return user
}
