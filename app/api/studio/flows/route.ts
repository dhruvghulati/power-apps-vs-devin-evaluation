import { handler, HttpError, readJson, required } from '@/lib/server/api'
import { randomId } from '@/lib/server/crypto'
import { db, timestamp } from '@/lib/server/store'
import { triggerCatalog } from '@/lib/server/studio'
import type { Flow, FlowStep, TriggerType } from '@/lib/server/studio-types'
import type { Environment } from '@/lib/server/types'

export const GET = handler(async ({ authorize }) => {
  authorize('flow:read', { resource: 'flow' })
  const store = db()
  return Response.json({
    flows: store.flows,
    runs: store.flowRuns.slice(0, 50),
    tasks: store.flowTasks.slice(0, 50),
    triggers: triggerCatalog,
    connectors: store.connectors.map(({ id, name, topic }) => ({ id, name, topic })),
  })
})

interface CreateFlowBody {
  name: string
  description?: string
  trigger: TriggerType
  steps: FlowStep[]
  environment?: Environment
  connectors?: string[]
}

export const POST = handler(async ({ user, authorize, audit }, request) => {
  authorize('flow:build', { resource: 'flow', eventType: 'flow.create.denied' })
  const body = await readJson<CreateFlowBody>(request)
  required(body.name, 'name is required.')
  const trigger = required(body.trigger, 'trigger is required.')
  if (!triggerCatalog.some((candidate) => candidate.id === trigger)) throw new HttpError(400, `Unknown trigger ${trigger}.`)
  if (!Array.isArray(body.steps) || body.steps.length === 0) throw new HttpError(400, 'A flow needs at least one step.')

  const flow: Flow = {
    id: randomId('flw'),
    name: body.name,
    description: body.description ?? '',
    owner: user.id,
    environment: body.environment ?? 'development',
    trigger,
    steps: body.steps.map((step, index) => ({ ...step, id: step.id || `stp_${index + 1}_${randomId('s')}` })),
    status: 'draft',
    connectors: body.connectors ?? [],
    createdAt: timestamp(),
    runCount: 0,
  }
  db().flows.push(flow)
  audit({
    eventType: 'flow.created',
    resource: 'flow',
    resourceId: flow.id,
    outcome: 'allow',
    after: { name: flow.name, trigger: flow.trigger, steps: flow.steps.length, environment: flow.environment },
  })
  return Response.json({ flow }, { status: 201 })
})
