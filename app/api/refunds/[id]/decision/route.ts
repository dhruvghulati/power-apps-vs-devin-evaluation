import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { outstandingApprovalSlots, requiredApprovals, roles } from '@/lib/server/policy'
import { projectRefund } from '@/lib/server/projections'
import { db, timestamp } from '@/lib/server/store'

interface DecisionBody {
  decision: 'approved' | 'rejected'
  notes: string
}

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const refund = found(store.refunds.find((r) => r.id === params.id), 'Refund not found.')
  const { decision, notes } = await readJson<DecisionBody>(request)
  required(notes, 'Decision notes are mandatory for every approval or rejection.')
  const approvedRoles = refund.approvals.filter((a) => a.decision === 'approved').map((a) => a.role)

  const obligations = authorize(decision === 'approved' ? 'refund:approve' : 'refund:reject', {
    resource: 'refund',
    resourceId: refund.id,
    entity: refund.entity,
    amountMinor: refund.amountMinor,
    initiatorId: refund.requestedBy,
    existingApprovers: refund.approvals.map((a) => a.actorId),
    approvedRoles,
    eventType: `refund.${decision}.denied`,
  })

  if (refund.status !== 'pending') {
    throw new HttpError(409, `Refund is ${refund.status} and can no longer be decided.`)
  }

  const before = { status: refund.status, approvals: refund.approvals.length }
  const fills = outstandingApprovalSlots(refund.amountMinor, approvedRoles).find((slot) => slot.some((role) => user.roles.includes(role)))
  const role = fills?.find((candidate) => user.roles.includes(candidate)) ?? user.roles[0]
  refund.approvals.push({
    actorId: user.id,
    actorEmail: user.email,
    role,
    decision,
    notes,
    at: timestamp(),
  })

  if (decision === 'rejected') {
    refund.status = 'rejected'
  } else {
    const outstanding = outstandingApprovalSlots(refund.amountMinor, [...approvedRoles, role])
    refund.status = outstanding.length === 0 ? 'approved' : 'pending'
  }

  audit({
    eventType: `refund.${decision}`,
    resource: 'refund',
    resourceId: refund.id,
    outcome: 'allow',
    before,
    after: { status: refund.status, approvals: refund.approvals.length },
    metadata: { notes, obligations, threshold: requiredApprovals(refund.amountMinor).label },
  })

  return Response.json({
    refund: projectRefund(refund, user),
    obligations,
    awaitingRoles: outstandingApprovalSlots(
      refund.amountMinor,
      refund.approvals.filter((a) => a.decision === 'approved').map((a) => a.role),
    ).map((slot) => slot.map((r) => roles[r].name).join(' / ')),
  })
})
