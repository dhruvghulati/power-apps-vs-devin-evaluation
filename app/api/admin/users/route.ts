import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { findSoDConflict, permissionsFor, roles } from '@/lib/server/policy'
import { db, timestamp } from '@/lib/server/store'
import type { RoleId } from '@/lib/server/types'

export const GET = handler(async ({ authorize }) => {
  authorize('admin:users', { resource: 'user' })
  const store = db()
  return Response.json({
    users: store.users.map((user) => ({ ...user, permissions: permissionsFor(user) })),
    roles: Object.values(roles),
    accessReviews: store.accessReviews,
  })
})

interface GrantBody {
  userId: string
  role: RoleId
  operation: 'grant' | 'revoke'
  justification: string
}

export const POST = handler(async ({ authorize, audit }, request) => {
  const body = await readJson<GrantBody>(request)
  authorize('admin:roles', { resource: 'user', resourceId: body.userId, eventType: 'role.change.denied' })
  required(body.justification, 'A justification is recorded against every entitlement change.')

  const user = found(db().users.find((candidate) => candidate.id === body.userId), 'Identity not found.')
  const before = [...user.roles]

  if (body.operation === 'revoke') {
    user.roles = user.roles.filter((role) => role !== body.role)
  } else {
    if (user.roles.includes(body.role)) throw new HttpError(409, 'Role already granted.')
    const conflict = findSoDConflict(user.roles, body.role)
    if (conflict) {
      audit({
        eventType: 'sod.blocked',
        resource: 'user',
        resourceId: user.id,
        outcome: 'deny',
        reason: conflict.reason,
        metadata: { attemptedRole: body.role, conflictWith: conflict.conflictWith, justification: body.justification },
      })
      throw new HttpError(409, conflict.reason, { conflictWith: conflict.conflictWith, preventiveControl: 'SoD' })
    }
    user.roles.push(body.role)
  }
  user.lastAccessReviewAt = timestamp()

  audit({
    eventType: `role.${body.operation}ed`,
    resource: 'user',
    resourceId: user.id,
    outcome: 'allow',
    before: { roles: before },
    after: { roles: user.roles },
    metadata: { justification: body.justification },
  })
  return Response.json({ user: { ...user, permissions: permissionsFor(user) } })
})
