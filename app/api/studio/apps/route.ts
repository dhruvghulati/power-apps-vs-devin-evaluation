import { found, handler, readJson, required } from '@/lib/server/api'
import { componentCatalog, instantiateTemplate, templateCatalog, visibleApps } from '@/lib/server/studio'
import { db } from '@/lib/server/store'
import type { Environment, RoleId } from '@/lib/server/types'

export const GET = handler(async ({ user, authorize }) => {
  authorize('app:read', { resource: 'app' })
  return Response.json({
    apps: visibleApps(user),
    templates: templateCatalog,
    components: componentCatalog,
    connectors: db().connectors.map(({ id, name, kind, topic, status }) => ({ id, name, kind, topic, status })),
  })
})

interface CreateBody {
  templateId: string
  name?: string
  environment?: Environment
  audienceRoles?: RoleId[]
}

export const POST = handler(async ({ user, authorize, audit }, request) => {
  authorize('app:build', { resource: 'app', eventType: 'app.create.denied' })
  const body = await readJson<CreateBody>(request)
  const template = found(
    templateCatalog.find((candidate) => candidate.id === required(body.templateId, 'templateId is required.')),
    'Template not found.',
  )
  const app = instantiateTemplate(template, {
    name: body.name,
    owner: user.id,
    environment: body.environment ?? 'development',
    audienceRoles: body.audienceRoles,
  })
  db().apps.push(app)
  audit({
    eventType: 'app.created',
    resource: 'app',
    resourceId: app.id,
    outcome: 'allow',
    after: { name: app.name, templateId: template.id, environment: app.environment, audienceRoles: app.audienceRoles },
  })
  return Response.json({ app }, { status: 201 })
})
