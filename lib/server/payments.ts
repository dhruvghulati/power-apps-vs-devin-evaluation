import { randomId, sha256 } from './crypto'
import { db, timestamp } from './store'
import type { LedgerEntry, Payment, Refund } from './types'

/**
 * Deterministic stand-in for a PSP (Stripe/Adyen). Real integrations swap this
 * adapter out; the surrounding controls — idempotency, screening, ledger
 * postings, reconciliation — stay identical.
 */
export interface PspAdapter {
  submit(payment: Payment): { reference: string; accepted: boolean; failureCode?: string }
}

export const demoPsp: PspAdapter = {
  submit(payment) {
    const digest = sha256(`${payment.refundId}:${payment.amountMinor}`)
    // ~6% of payouts fail at the rail so the failure path is demonstrable.
    const accepted = parseInt(digest.slice(0, 2), 16) > 15
    return {
      reference: `psp_${digest.slice(0, 10)}`,
      accepted,
      failureCode: accepted ? undefined : 'instrument_declined',
    }
  },
}

export function screen(refund: Refund): Payment['screening'] {
  const store = db()
  const paidToday = store.payments.filter(
    (p) => p.refundId !== refund.id && store.refunds.find((r) => r.id === p.refundId)?.customerId === refund.customerId,
  )
  const kycCase = store.kycCases.find((c) => c.customerId === refund.customerId)
  return {
    sanctions: kycCase?.sanctionsScreening.result === 'match' ? 'hit' : 'clear',
    velocity: paidToday.length >= 3 ? 'flagged' : 'clear',
    at: timestamp(),
  }
}

export function post(paymentId: string, entries: Omit<LedgerEntry, 'id' | 'paymentId' | 'at'>[]): LedgerEntry[] {
  const debits = entries.filter((e) => e.direction === 'debit').reduce((sum, e) => sum + e.amountMinor, 0)
  const credits = entries.filter((e) => e.direction === 'credit').reduce((sum, e) => sum + e.amountMinor, 0)
  if (debits !== credits) throw new Error(`Unbalanced ledger posting for ${paymentId}: ${debits} != ${credits}`)

  const created = entries.map((entry) => ({ ...entry, id: randomId('led'), paymentId, at: timestamp() }))
  db().ledger.push(...created)
  return created
}

export function isBalanced(): boolean {
  const totals = db().ledger.reduce((acc, entry) => {
    acc[entry.currency] = (acc[entry.currency] ?? 0) + (entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor)
    return acc
  }, {} as Record<string, number>)
  return Object.values(totals).every((value) => value === 0)
}

export function formatAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amountMinor / 100)
}
