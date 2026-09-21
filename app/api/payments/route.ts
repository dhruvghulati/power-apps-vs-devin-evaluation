import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { randomId } from '@/lib/server/crypto'
import { isBalanced, post, screen } from '@/lib/server/payments'
import { projectInstrument } from '@/lib/server/projections'
import { db, timestamp } from '@/lib/server/store'
import type { Payment } from '@/lib/server/types'

export const GET = handler(async ({ user, authorize }) => {
  authorize('payment:read', { resource: 'payment' })
  const store = db()
  return Response.json({
    payments: store.payments.map((payment) => ({
      ...payment,
      refund: store.refunds.find((r) => r.id === payment.refundId)?.reason ?? null,
      instrument: projectInstrument(found(store.instruments.find((i) => i.id === payment.instrumentId), 'instrument'), user),
    })),
    ledger: store.ledger,
    reconciliation: {
      balanced: isBalanced(),
      unreconciled: store.payments.filter((p) => p.status === 'settled' && !p.reconciledAt).length,
      failed: store.payments.filter((p) => p.status === 'failed').length,
      awaitingApproval: store.payments.filter((p) => p.status === 'requires_approval').length,
    },
  })
})

interface InitiateBody {
  refundId: string
  idempotencyKey: string
}

export const POST = handler(async ({ user, authorize, audit }, request) => {
  const { refundId, idempotencyKey } = await readJson<InitiateBody>(request)
  required(idempotencyKey, 'An idempotency key is required so a retried payout never double-pays.')
  const store = db()
  const refund = found(store.refunds.find((r) => r.id === refundId), 'Refund not found.')

  authorize('payment:initiate', {
    resource: 'payment',
    resourceId: refund.id,
    entity: refund.entity,
    amountMinor: refund.amountMinor,
    eventType: 'payment.initiate.denied',
  })

  const existingId = store.idempotency.get(idempotencyKey)
  if (existingId) {
    const existing = found(store.payments.find((p) => p.id === existingId), 'payment')
    audit({ eventType: 'payment.idempotent_replay', resource: 'payment', resourceId: existing.id, outcome: 'allow', metadata: { idempotencyKey } })
    return Response.json({ payment: existing, replayed: true })
  }

  if (refund.status !== 'approved') {
    throw new HttpError(409, `Refund ${refund.id} is ${refund.status}; only approved refunds can be paid.`)
  }
  if (store.payments.some((p) => p.refundId === refund.id && p.status !== 'failed')) {
    throw new HttpError(409, 'A payout already exists for this refund.')
  }

  const screening = screen(refund)
  if (screening.sanctions === 'hit') {
    audit({ eventType: 'payment.blocked', resource: 'payment', resourceId: refund.id, outcome: 'deny', reason: 'Sanctions screening hit on beneficiary.' })
    throw new HttpError(409, 'Sanctions screening hit: payout blocked and referred to the MLRO.')
  }

  const payment: Payment = {
    id: randomId('pay'),
    refundId: refund.id,
    idempotencyKey,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
    instrumentId: refund.instrumentId,
    status: 'requires_approval',
    initiatedBy: user.id,
    approvedBy: [],
    createdAt: timestamp(),
    updatedAt: timestamp(),
    screening,
  }
  store.payments.unshift(payment)
  store.idempotency.set(idempotencyKey, payment.id)
  refund.paymentId = payment.id
  post(payment.id, [
    { account: 'refunds_payable', direction: 'debit', amountMinor: payment.amountMinor, currency: payment.currency, memo: `Refund ${refund.id} payable recognised` },
    { account: 'cash_clearing', direction: 'credit', amountMinor: payment.amountMinor, currency: payment.currency, memo: `Payout ${payment.id} pending release` },
  ])

  audit({
    eventType: 'payment.initiated',
    resource: 'payment',
    resourceId: payment.id,
    outcome: 'allow',
    after: { status: payment.status, amountMinor: payment.amountMinor, screening },
    metadata: { idempotencyKey, psp: 'demo-psp' },
  })
  return Response.json({ payment, replayed: false }, { status: 201 })
})
