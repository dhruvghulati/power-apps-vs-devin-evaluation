import { handler, readJson, required } from '@/lib/server/api'
import { randomId } from '@/lib/server/crypto'
import { db, timestamp } from '@/lib/server/store'
import type { SavedView } from '@/lib/server/types'

export const GET = handler(async ({ user, authorize }) => {
  authorize('view:manage', { resource: 'saved_view' })
  const views = db().views.filter((view) => view.ownerId === user.id || view.shared)
  return Response.json({ views, ownViewCount: views.filter((v) => v.ownerId === user.id).length })
})

export const POST = handler(async ({ user, authorize, audit }, request) => {
  const body = await readJson<Partial<SavedView>>(request)
  authorize('view:manage', { resource: 'saved_view' })
  if (body.shared) authorize('view:share', { resource: 'saved_view', eventType: 'view.share.denied' })

  const store = db()
  const view: SavedView = {
    id: randomId('vw'),
    ownerId: user.id,
    name: required(body.name, 'A view name is required.'),
    resource: required(body.resource, 'A resource is required.'),
    filters: body.filters ?? {},
    columns: body.columns?.length ? body.columns : ['id', 'status'],
    sort: body.sort,
    isDefault: Boolean(body.isDefault),
    shared: Boolean(body.shared),
    createdAt: timestamp(),
  }
  if (view.isDefault) {
    for (const existing of store.views.filter((v) => v.ownerId === user.id && v.resource === view.resource)) {
      existing.isDefault = false
    }
  }
  store.views.push(view)
  audit({ eventType: 'view.created', resource: 'saved_view', resourceId: view.id, outcome: 'allow', after: { name: view.name, resource: view.resource, shared: view.shared } })
  return Response.json({ view }, { status: 201 })
})
