import { found, handler, readJson, required } from '@/lib/server/api'
import { randomId } from '@/lib/server/crypto'
import { outstandingApprovalSlots, requiredApprovals, roles } from '@/lib/server/policy'
import { projectInstrument, projectRefund } from '@/lib/server/projections'
import { db, timestamp } from '@/lib/server/store'
import type { Refund } from '@/lib/server/types'

export const GET = handler(async ({ user, authorize }) => {
  authorize('refund:read', { resource: 'refund' })
  const store = db()
  const visible = store.refunds.filter((refund) => user.scope === '*' || refund.entity === user.scope)
  return Response.json({
    refunds: visible.map((refund) => ({
      ...projectRefund(refund, user),
      instrument: projectInstrument(found(store.instruments.find((i) => i.id === refund.instrumentId), 'instrument'), user),
      approvalsOutstanding: Math.max(refund.requiredApprovals - refund.approvals.filter((a) => a.decision === 'approved').length, 0),
      awaitingRoles: outstandingApprovalSlots(
        refund.amountMinor,
        refund.approvals.filter((a) => a.decision === 'approved').map((a) => a.role),
      ).map((slot) => slot.map((role) => roles[role].name).join(' / ')),
    })),
    scope: user.scope,
    hiddenByScope: store.refunds.length - visible.length,
  })
})

export const POST = handler(async ({ user, authorize, audit }, request) => {
  const body = await readJson<Partial<Refund> & { amountMinor: number }>(request)
  const entity = required(body.entity, 'entity is required.')
  authorize('refund:write', { resource: 'refund', entity, eventType: 'refund.create.denied' })

  const store = db()
  const instrument = found(store.instruments.find((i) => i.id === body.instrumentId), 'Unknown payment instrument.')
  const amountMinor = required(body.amountMinor, 'amountMinor is required.')
  const refund: Refund = {
    id: randomId('rfd'),
    customerId: instrument.customerId,
    customerName: required(body.customerName, 'customerName is required.'),
    customerEmail: required(body.customerEmail, 'customerEmail is required.'),
    amountMinor,
    currency: body.currency ?? 'USD',
    reason: required(body.reason, 'reason is required.'),
    status: 'pending',
    priority: body.priority ?? 'medium',
    requestedBy: user.id,
    requestedAt: timestamp(),
    entity,
    instrumentId: instrument.id,
    approvals: [],
    requiredApprovals: requiredApprovals(amountMinor).approvals,
    sanctionsCleared: false,
    regEDeadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
  }
  store.refunds.unshift(refund)
  audit({ eventType: 'refund.created', resource: 'refund', resourceId: refund.id, outcome: 'allow', after: { amountMinor, entity, status: 'pending' } })
  return Response.json({ refund: projectRefund(refund, user) }, { status: 201 })
})
