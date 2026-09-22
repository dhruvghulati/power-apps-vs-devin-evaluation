import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { db, timestamp } from '@/lib/server/store'

type Action = 'sign_off' | 'start' | 'pause' | 'conclude'

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const experiment = found(store.experiments.find((e) => e.id === params.id), 'Experiment not found.')
  const flag = found(store.flags.find((f) => f.id === experiment.flagId), 'Flag not found.')
  const { action, notes } = await readJson<{ action: Action; notes?: string }>(request)
  const before = { status: experiment.status, signedOffBy: experiment.signedOffBy }

  switch (required(action, 'action is required.')) {
    case 'sign_off': {
      authorize('experiment:approve', {
        resource: 'experiment',
        resourceId: experiment.id,
        initiatorId: experiment.owner,
        riskTier: flag.riskTier,
        eventType: 'experiment.sign_off.denied',
      })
      required(notes, 'Compliance sign-off requires a rationale.')
      experiment.signedOffBy = user.id
      break
    }
    case 'start': {
      authorize('experiment:write', { resource: 'experiment', resourceId: experiment.id, eventType: 'experiment.start.denied' })
      if (experiment.requiresComplianceSignoff && !experiment.signedOffBy) {
        throw new HttpError(409, 'This experiment touches a regulated surface and needs compliance sign-off before it can run.')
      }
      if (flag.killed) throw new HttpError(409, 'The backing flag is killed; clear the incident first.')
      experiment.status = 'running'
      experiment.startedAt = timestamp()
      break
    }
    case 'pause': {
      authorize('experiment:write', { resource: 'experiment', resourceId: experiment.id, eventType: 'experiment.pause.denied' })
      experiment.status = 'paused'
      break
    }
    case 'conclude': {
      authorize('experiment:write', { resource: 'experiment', resourceId: experiment.id, eventType: 'experiment.conclude.denied' })
      required(notes, 'A readout is required when concluding an experiment.')
      experiment.status = 'concluded'
      experiment.concludedAt = timestamp()
      break
    }
    default:
      throw new HttpError(400, `Unsupported action ${action}.`)
  }

  audit({
    eventType: `experiment.${action}`,
    resource: 'experiment',
    resourceId: experiment.id,
    outcome: 'allow',
    before,
    after: { status: experiment.status, signedOffBy: experiment.signedOffBy },
    metadata: { notes, flagKey: flag.key },
  })
  return Response.json({ experiment })
})
