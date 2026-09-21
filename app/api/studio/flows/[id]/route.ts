import { found, handler, HttpError, readJson } from '@/lib/server/api'
import { runFlow } from '@/lib/server/flows'
import { db } from '@/lib/server/store'
import type { Flow, FlowStep } from '@/lib/server/studio-types'

function load(id: string): Flow {
  return found(db().flows.find((flow) => flow.id === id), 'Flow not found.')
}

interface PatchBody {
  name?: string
  description?: string
  steps?: FlowStep[]
  trigger?: Flow['trigger']
  connectors?: string[]
}

export const PATCH = handler(async ({ user, authorize, audit }, request, params) => {
  authorize('flow:build', { resource: 'flow', resourceId: params.id, eventType: 'flow.edit.denied' })
  const flow = load(params.id)
  if (flow.owner !== user.id && !user.roles.includes('admin'))
    throw new HttpError(403, 'Only the flow owner or a platform administrator can edit this flow.')
  const body = await readJson<PatchBody>(request)
  const before = { steps: flow.steps.length, trigger: flow.trigger, status: flow.status }

  if (body.name) flow.name = body.name
  if (body.description !== undefined) flow.description = body.description
  if (body.steps) flow.steps = body.steps
  if (body.trigger) flow.trigger = body.trigger
  if (body.connectors) flow.connectors = body.connectors
  // Any edit sends an active flow back to draft so it must be re-activated.
  if (flow.status === 'active') flow.status = 'draft'

  audit({
    eventType: 'flow.updated',
    resource: 'flow',
    resourceId: flow.id,
    outcome: 'allow',
    before,
    after: { steps: flow.steps.length, trigger: flow.trigger, status: flow.status },
  })
  return Response.json({ flow })
})

interface ActionBody {
  action: 'activate' | 'pause' | 'test'
  sample?: Record<string, unknown>
}

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const body = await readJson<ActionBody>(request)
  const flow = load(params.id)

  if (body.action === 'test') {
    authorize('flow:build', { resource: 'flow', resourceId: flow.id, eventType: 'flow.test.denied' })
    const run = runFlow(
      flow,
      { ...(body.sample ?? {}), payload: body.sample ?? {} },
      user.id,
      'manual-test',
    )
    return Response.json({ run })
  }

  authorize('flow:publish', { resource: 'flow', resourceId: flow.id, eventType: 'flow.publish.denied' })

  if (body.action === 'pause') {
    flow.status = 'paused'
    audit({ eventType: 'flow.paused', resource: 'flow', resourceId: flow.id, outcome: 'allow' })
    return Response.json({ flow })
  }

  if (flow.environment === 'production' && flow.owner === user.id && !user.roles.includes('admin'))
    throw new HttpError(403, 'Activating a production flow requires an independent approver.')
  if (flow.steps.some((step) => step.kind === 'action' && step.action === 'kill_flag') && !user.roles.includes('admin'))
    throw new HttpError(403, 'Flows containing a kill-switch action must be activated by a platform administrator.')

  flow.status = 'active'
  audit({
    eventType: 'flow.activated',
    resource: 'flow',
    resourceId: flow.id,
    outcome: 'allow',
    after: { trigger: flow.trigger, environment: flow.environment, steps: flow.steps.length },
  })
  return Response.json({ flow })
})
