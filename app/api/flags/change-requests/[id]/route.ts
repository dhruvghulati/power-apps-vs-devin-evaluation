import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { db, timestamp } from '@/lib/server/store'

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const changeRequest = found(store.changeRequests.find((c) => c.id === params.id), 'Change request not found.')
  const flag = found(store.flags.find((f) => f.id === changeRequest.flagId), 'Flag not found.')
  const { decision, notes } = await readJson<{ decision: 'approve' | 'reject'; notes?: string }>(request)

  const obligations = authorize('flag:approve', {
    resource: 'flag_change_request',
    resourceId: changeRequest.id,
    environment: changeRequest.environment,
    riskTier: flag.riskTier,
    initiatorId: changeRequest.proposedBy,
    eventType: `flag.${decision}.denied`,
  })
  if (changeRequest.status !== 'pending') throw new HttpError(409, `Change request is already ${changeRequest.status}.`)
  required(notes, 'Review notes are required on production change approvals.')

  const before = { status: changeRequest.status, environment: flag.environments[changeRequest.environment] }
  if (decision === 'approve') {
    changeRequest.status = 'applied'
    flag.environments[changeRequest.environment] = { ...changeRequest.after, updatedAt: timestamp(), updatedBy: user.id }
  } else {
    changeRequest.status = 'rejected'
  }
  changeRequest.reviewedBy = user.id
  changeRequest.reviewedAt = timestamp()
  changeRequest.reviewNotes = notes

  audit({
    eventType: decision === 'approve' ? 'flag.change_applied' : 'flag.change_rejected',
    resource: 'feature_flag',
    resourceId: flag.id,
    outcome: 'allow',
    before,
    after: { status: changeRequest.status, environment: flag.environments[changeRequest.environment] },
    metadata: { ticket: changeRequest.ticket, notes, obligations },
  })
  return Response.json({ changeRequest, flag })
})
