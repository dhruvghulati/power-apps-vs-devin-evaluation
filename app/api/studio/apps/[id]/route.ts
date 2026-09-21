import { found, handler, HttpError, readJson } from '@/lib/server/api'
import { checkApp, componentCatalog } from '@/lib/server/studio'
import { db, timestamp } from '@/lib/server/store'
import type { AppScreen, MakerApp } from '@/lib/server/studio-types'

function load(id: string): MakerApp {
  return found(db().apps.find((app) => app.id === id), 'App not found.')
}

export const GET = handler(async ({ user, authorize }, _request, params) => {
  authorize('app:read', { resource: 'app', resourceId: params.id })
  const app = load(params.id)
  const privileged = user.roles.includes('admin') || user.roles.includes('auditor')
  const inAudience = app.status === 'published' && app.audienceRoles.some((role) => user.roles.includes(role))
  if (app.owner !== user.id && !inAudience && !privileged)
    throw new HttpError(403, `This app is published to ${app.audienceRoles.join(', ')}; your roles are ${user.roles.join(', ')}.`)
  return Response.json({ app, components: componentCatalog, checks: checkApp(app) })
})

interface PatchBody {
  name?: string
  description?: string
  screens?: AppScreen[]
  audienceRoles?: MakerApp['audienceRoles']
  connectors?: string[]
  environment?: MakerApp['environment']
}

export const PATCH = handler(async ({ user, authorize, audit }, request, params) => {
  authorize('app:build', { resource: 'app', resourceId: params.id, eventType: 'app.edit.denied' })
  const app = load(params.id)
  if (app.owner !== user.id && !user.roles.includes('admin'))
    throw new HttpError(403, 'Only the app owner or a platform administrator can edit this app.')

  const body = await readJson<PatchBody>(request)
  const before = { name: app.name, screens: app.screens.length, audienceRoles: app.audienceRoles, connectors: app.connectors, status: app.status }

  if (body.name) app.name = body.name
  if (body.description) app.description = body.description
  if (body.screens) app.screens = body.screens
  if (body.audienceRoles) app.audienceRoles = body.audienceRoles
  if (body.connectors) app.connectors = body.connectors
  if (body.environment) app.environment = body.environment
  // Any change to what the app exposes invalidates its published state: the solution
  // checker must pass again before the audience sees the new version.
  const exposureChanged = Boolean(body.screens || body.audienceRoles || body.connectors || body.environment)
  if (app.status === 'published' && exposureChanged) {
    app.status = 'draft'
    app.publishedAt = undefined
  }
  app.updatedAt = timestamp()

  audit({
    eventType: 'app.updated',
    resource: 'app',
    resourceId: app.id,
    outcome: 'allow',
    before,
    after: { name: app.name, screens: app.screens.length, audienceRoles: app.audienceRoles, connectors: app.connectors, status: app.status },
  })
  return Response.json({ app, checks: checkApp(app) })
})

interface ActionBody {
  action: 'publish' | 'unpublish' | 'check'
  note?: string
}

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const body = await readJson<ActionBody>(request)
  const app = load(params.id)

  if (body.action === 'check') {
    authorize('app:read', { resource: 'app', resourceId: app.id })
    return Response.json({ checks: checkApp(app) })
  }

  authorize('app:publish', { resource: 'app', resourceId: app.id, eventType: 'app.publish.denied' })

  if (body.action === 'unpublish') {
    app.status = 'draft'
    app.updatedAt = timestamp()
    audit({ eventType: 'app.unpublished', resource: 'app', resourceId: app.id, outcome: 'allow', metadata: { note: body.note } })
    return Response.json({ app, checks: checkApp(app) })
  }

  const checks = checkApp(app)
  const errors = checks.filter((check) => check.severity === 'error')
  if (errors.length > 0) {
    audit({
      eventType: 'app.publish_blocked',
      resource: 'app',
      resourceId: app.id,
      outcome: 'deny',
      reason: errors.map((error) => error.message).join(' '),
      metadata: { checks },
    })
    throw new HttpError(409, 'Solution checker blocked publish.', { checks })
  }
  if (app.environment === 'production' && app.owner === user.id && !user.roles.includes('admin')) {
    const reason = 'Production publish requires an independent approver: ask a platform administrator or MLRO to publish.'
    audit({ eventType: 'app.publish.denied', resource: 'app', resourceId: app.id, outcome: 'deny', reason, metadata: { control: 'sod.independent_publisher' } })
    throw new HttpError(403, reason, { control: 'sod.independent_publisher' })
  }

  app.status = 'published'
  app.version += 1
  app.publishedAt = timestamp()
  app.updatedAt = app.publishedAt
  audit({
    eventType: 'app.published',
    resource: 'app',
    resourceId: app.id,
    outcome: 'allow',
    after: { version: app.version, environment: app.environment, audienceRoles: app.audienceRoles },
    metadata: { note: body.note, checks },
  })
  return Response.json({ app, checks })
})
