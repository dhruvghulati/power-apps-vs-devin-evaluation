import { found, handler, readJson, required } from '@/lib/server/api'
import { db, timestamp } from '@/lib/server/store'

/** Kill switch: disables a flag everywhere without waiting for an approver. */
export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const flag = found(store.flags.find((f) => f.id === params.id), 'Flag not found.')
  const { reason } = await readJson<{ reason: string }>(request)
  authorize('flag:kill', { resource: 'feature_flag', resourceId: flag.id, eventType: 'flag.kill.denied' })
  required(reason, 'An incident reason is required to trip the kill switch.')

  const before = JSON.parse(JSON.stringify(flag.environments))
  for (const environment of ['development', 'staging', 'production'] as const) {
    flag.environments[environment] = { enabled: false, rolloutPercent: 0, updatedAt: timestamp(), updatedBy: user.id }
  }
  flag.killed = true
  for (const experiment of store.experiments.filter((e) => e.flagId === flag.id && e.status === 'running')) {
    experiment.status = 'paused'
  }

  audit({
    eventType: 'flag.killed',
    resource: 'feature_flag',
    resourceId: flag.id,
    outcome: 'allow',
    before,
    after: flag.environments,
    metadata: { reason, pausedExperiments: store.experiments.filter((e) => e.flagId === flag.id).map((e) => e.id) },
  })
  return Response.json({ flag })
})
