import { found, handler, HttpError, readJson } from '@/lib/server/api'
import { db } from '@/lib/server/store'
import type { SavedView } from '@/lib/server/types'

function ownedView(id: string, userId: string): SavedView {
  const view = found(db().views.find((v) => v.id === id), 'View not found.')
  if (view.ownerId !== userId) throw new HttpError(403, 'Saved views can only be modified by their owner.')
  return view
}

export const PATCH = handler(async ({ user, authorize, audit }, request, params) => {
  authorize('view:manage', { resource: 'saved_view', resourceId: params.id })
  const view = ownedView(params.id, user.id)
  const body = await readJson<Partial<SavedView>>(request)
  if (body.shared && !view.shared) authorize('view:share', { resource: 'saved_view', resourceId: view.id, eventType: 'view.share.denied' })

  const before = { ...view }
  Object.assign(view, {
    name: body.name ?? view.name,
    filters: body.filters ?? view.filters,
    columns: body.columns ?? view.columns,
    sort: body.sort ?? view.sort,
    shared: body.shared ?? view.shared,
    isDefault: body.isDefault ?? view.isDefault,
  })
  if (view.isDefault) {
    for (const other of db().views.filter((v) => v.ownerId === user.id && v.resource === view.resource && v.id !== view.id)) {
      other.isDefault = false
    }
  }
  audit({ eventType: 'view.updated', resource: 'saved_view', resourceId: view.id, outcome: 'allow', before, after: view })
  return Response.json({ view })
})

export const DELETE = handler(async ({ user, authorize, audit }, _request, params) => {
  authorize('view:manage', { resource: 'saved_view', resourceId: params.id })
  const view = ownedView(params.id, user.id)
  const store = db()
  store.views = store.views.filter((v) => v.id !== view.id)
  audit({ eventType: 'view.deleted', resource: 'saved_view', resourceId: view.id, outcome: 'allow', before: view })
  return Response.json({ deleted: view.id })
})
