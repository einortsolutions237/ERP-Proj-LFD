import { vi } from 'vitest'

let activeCookie: string | null = null

export function mockNextHeaders() {
  vi.mock('next/headers', () => ({
    cookies: async () => ({
      get: (name: string) => (activeCookie ? { name, value: activeCookie } : undefined),
    }),
  }))
}

export async function withSession<T>(sessionCookie: string | null, fn: () => Promise<T>): Promise<T> {
  const previous = activeCookie
  activeCookie = sessionCookie
  try {
    return await fn()
  } finally {
    activeCookie = previous
  }
}
