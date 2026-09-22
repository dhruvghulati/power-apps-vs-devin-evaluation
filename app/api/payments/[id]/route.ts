import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { demoPsp, post, screen } from '@/lib/server/payments'
import { db, timestamp } from '@/lib/server/store'

type Action = 'approve' | 'execute' | 'reconcile' | 'reverse'

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const payment = found(store.payments.find((p) => p.id === params.id), 'Payment not found.')
  const refund = found(store.refunds.find((r) => r.id === payment.refundId), 'Refund not found.')
  const { action, reason } = await readJson<{ action: Action; reason?: string }>(request)
  const before = { status: payment.status, approvedBy: [...payment.approvedBy] }

  switch (required(action, 'action is required.')) {
    case 'approve': {
      authorize('payment:approve', {
        resource: 'payment',
        resourceId: payment.id,
        entity: refund.entity,
        amountMinor: payment.amountMinor,
        initiatorId: payment.initiatedBy,
        existingApprovers: payment.approvedBy,
        eventType: 'payment.approve.denied',
      })
      if (payment.status !== 'requires_approval') throw new HttpError(409, `Payment is ${payment.status}.`)
      payment.approvedBy.push(user.id)
      payment.status = 'authorized'
      break
    }
    case 'execute': {
      authorize('payment:execute', {
        resource: 'payment',
        resourceId: payment.id,
        entity: refund.entity,
        amountMinor: payment.amountMinor,
        eventType: 'payment.execute.denied',
      })
      if (payment.status !== 'authorized') throw new HttpError(409, `Payment must be authorized before release (currently ${payment.status}).`)

      // Screening is re-run at release time: an approval from an hour ago is
      // not evidence that the beneficiary is still clear.
      payment.screening = screen(refund)
      if (payment.screening.sanctions === 'hit') {
        payment.status = 'failed'
        payment.failureCode = 'sanctions_hit'
        audit({ eventType: 'payment.blocked', resource: 'payment', resourceId: payment.id, outcome: 'deny', reason: 'Sanctions hit at release time.' })
        throw new HttpError(409, 'Sanctions screening hit at release: payout blocked.')
      }

      const result = demoPsp.submit(payment)
      payment.pspReference = result.reference
      if (result.accepted) {
        payment.status = 'settled'
        payment.settledAt = timestamp()
        refund.status = 'paid'
        post(payment.id, [
          { account: 'cash_clearing', direction: 'debit', amountMinor: payment.amountMinor, currency: payment.currency, memo: `Payout ${payment.id} released` },
          { account: 'customer_payouts', direction: 'credit', amountMinor: payment.amountMinor, currency: payment.currency, memo: `Customer refunded via ${result.reference}` },
        ])
      } else {
        payment.status = 'failed'
        payment.failureCode = result.failureCode
        refund.status = 'payment_failed'
      }
      break
    }
    case 'reconcile': {
      authorize('payment:execute', { resource: 'payment', resourceId: payment.id, eventType: 'payment.reconcile.denied' })
      if (payment.status !== 'settled') throw new HttpError(409, 'Only settled payouts can be reconciled.')
      payment.reconciledAt = timestamp()
      break
    }
    case 'reverse': {
      authorize('payment:approve', {
        resource: 'payment',
        resourceId: payment.id,
        entity: refund.entity,
        initiatorId: payment.initiatedBy,
        eventType: 'payment.reverse.denied',
      })
      if (payment.status !== 'settled') throw new HttpError(409, 'Only settled payouts can be reversed.')
      payment.status = 'reversed'
      refund.status = 'approved'
      post(payment.id, [
        { account: 'customer_payouts', direction: 'debit', amountMinor: payment.amountMinor, currency: payment.currency, memo: `Reversal of ${payment.id}` },
        { account: 'cash_clearing', direction: 'credit', amountMinor: payment.amountMinor, currency: payment.currency, memo: `Funds returned to clearing` },
      ])
      break
    }
    default:
      throw new HttpError(400, `Unsupported action ${action}.`)
  }

  payment.updatedAt = timestamp()
  audit({
    eventType: `payment.${action}`,
    resource: 'payment',
    resourceId: payment.id,
    outcome: 'allow',
    before,
    after: { status: payment.status, approvedBy: payment.approvedBy, pspReference: payment.pspReference },
    metadata: { reason, screening: payment.screening },
  })
  return Response.json({ payment })
})
