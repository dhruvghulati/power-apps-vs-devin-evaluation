import { appendAudit, ensureAuditHistory } from '@/lib/server/audit'
import { handler, readJson, required } from '@/lib/server/api'
import { permissionsFor, roles } from '@/lib/server/policy'
import { readSessionUser, sessionCookie, SESSION_TIMEOUT_MS } from '@/lib/server/session'
import { db } from '@/lib/server/store'

export const GET = handler(async ({ user }) => {
  const { expiresAt } = await readSessionUser()
  return Response.json({
    user,
    permissions: permissionsFor(user),
    roleDefinitions: user.roles.map((role) => roles[role]),
    session: { expiresAt, idleTimeoutMinutes: SESSION_TIMEOUT_MS / 60000, mfa: user.mfaEnrolled },
    directory: db().users.map(({ id, name, roles: userRoles, department, scope }) => ({ id, name, roles: userRoles, department, scope })),
  })
})

export const POST = handler(async ({ user, ip }, request) => {
  ensureAuditHistory()
  const { userId } = await readJson<{ userId: string }>(request)
  const target = db().users.find((candidate) => candidate.id === required(userId, 'userId is required.'))
  if (!target) return Response.json({ error: 'Unknown identity.' }, { status: 404 })

  appendAudit({
    eventType: 'session.switched',
    actor: user,
    resource: 'session',
    resourceId: target.id,
    outcome: 'allow',
    ipAddress: ip,
    metadata: { demoPersonaSwitch: true, roles: target.roles },
  })

  const cookie = sessionCookie(target.id)
  const response = Response.json({ user: target, permissions: permissionsFor(target) })
  response.headers.append(
    'set-cookie',
    `${cookie.name}=${cookie.value}; Path=${cookie.options.path}; Max-Age=${cookie.options.maxAge}; HttpOnly; SameSite=Lax${cookie.options.secure ? '; Secure' : ''}`,
  )
  return response
})
