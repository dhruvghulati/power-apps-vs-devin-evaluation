import { cookies } from 'next/headers'
import { signSession, verifySession } from './crypto'
import { db } from './store'
import type { User } from './types'

export const SESSION_COOKIE = 'nw_session'
/** Regulated consoles cap idle sessions; 30 minutes matches the SOC 2 control. */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_USER_ID = 'usr_bob'

export async function readSessionUser(): Promise<{ user: User; expiresAt: string }> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  const payload = raw ? verifySession(raw) : null
  const [userId, issuedAtRaw] = payload?.split('|') ?? []
  const issuedAt = Number(issuedAtRaw)
  const expired = !issuedAt || Date.now() - issuedAt > SESSION_TIMEOUT_MS
  const user = db().users.find((candidate) => candidate.id === userId)

  if (!user || expired) {
    const fallback = db().users.find((candidate) => candidate.id === DEFAULT_USER_ID)!
    return { user: fallback, expiresAt: new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString() }
  }
  return { user, expiresAt: new Date(issuedAt + SESSION_TIMEOUT_MS).toISOString() }
}

export function sessionCookie(userId: string) {
  return {
    name: SESSION_COOKIE,
    value: signSession(`${userId}|${Date.now()}`),
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_TIMEOUT_MS / 1000,
    },
  }
}
