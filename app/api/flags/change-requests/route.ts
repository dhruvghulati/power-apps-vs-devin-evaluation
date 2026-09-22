import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { randomId } from '@/lib/server/crypto'
import { db, timestamp } from '@/lib/server/store'
import type { Environment, FlagChangeRequest } from '@/lib/server/types'

interface ProposeBody {
  flagId: string
  environment: Environment
  enabled: boolean
  rolloutPercent: number
  justification: string
  ticket: string
}

export const GET = handler(async ({ authorize }) => {
  authorize('flag:read', { resource: 'flag_change_request' })
  return Response.json({ changeRequests: db().changeRequests })
})

export const POST = handler(async ({ user, authorize, audit }, request) => {
  const body = await readJson<ProposeBody>(request)
  const store = db()
  const flag = found(store.flags.find((f) => f.id === body.flagId), 'Flag not found.')
  const environment = required(body.environment, 'environment is required.')

  authorize('flag:propose', {
    resource: 'flag_change_request',
    resourceId: flag.id,
    environment,
    riskTier: flag.riskTier,
    eventType: 'flag.propose.denied',
  })
  required(body.justification, 'A justification is required for every flag change.')
  required(body.ticket, 'A change ticket reference is required.')
  if (body.rolloutPercent < 0 || body.rolloutPercent > 100) throw new HttpError(400, 'rolloutPercent must be between 0 and 100.')

  const current = flag.environments[environment]
  const changeRequest: FlagChangeRequest = {
    id: randomId('chg'),
    flagId: flag.id,
    environment,
    proposedBy: user.id,
    proposedAt: timestamp(),
    justification: body.justification,
    ticket: body.ticket,
    before: { enabled: current.enabled, rolloutPercent: current.rolloutPercent },
    after: { enabled: body.enabled, rolloutPercent: body.rolloutPercent },
    status: 'pending',
  }

  // Non-production changes on standard-risk flags are self-service; production
  // and regulated surfaces always route through a second approver.
  const selfService = environment !== 'production' && flag.riskTier === 'standard'
  if (selfService) {
    changeRequest.status = 'applied'
    changeRequest.reviewedBy = user.id
    changeRequest.reviewedAt = timestamp()
    flag.environments[environment] = { ...changeRequest.after, updatedAt: timestamp(), updatedBy: user.id }
  }
  store.changeRequests.unshift(changeRequest)

  audit({
    eventType: selfService ? 'flag.changed' : 'flag.change_requested',
    resource: 'feature_flag',
    resourceId: flag.id,
    outcome: 'allow',
    before: changeRequest.before,
    after: changeRequest.after,
    metadata: { environment, ticket: body.ticket, justification: body.justification, riskTier: flag.riskTier, selfService },
  })
  return Response.json({ changeRequest, applied: selfService }, { status: 201 })
})
