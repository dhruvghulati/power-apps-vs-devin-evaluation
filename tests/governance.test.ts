import { beforeEach, describe, expect, it } from 'vitest'
import { appendAudit, verifyChain } from '@/lib/server/audit'
import { decryptDocument, encryptDocument, maskEmail, verifySignature, hmac } from '@/lib/server/crypto'
import { evaluate, findSoDConflict, hasPermission, outstandingApprovalSlots, requiredApprovals } from '@/lib/server/policy'
import { isBalanced, post } from '@/lib/server/payments'
import { db, resetDb } from '@/lib/server/store'
import { ingest, signPayload } from '@/lib/server/streams'
import type { User } from '@/lib/server/types'

const user = (id: string): User => {
  const found = db().users.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`missing seed user ${id}`)
  return found
}

beforeEach(() => {
  resetDb()
})

describe('policy engine', () => {
  it('denies permissions the role does not carry and explains why', () => {
    const decision = evaluate(user('usr_frank'), 'payment:execute')
    expect(decision.allow).toBe(false)
    expect(decision.reason).toContain('viewer')
  })

  it('enforces entity scope (ABAC) even when the role has the permission', () => {
    const bob = user('usr_bob')
    expect(evaluate(bob, 'refund:approve', { entity: 'eu-entity' }).allow).toBe(true)
    expect(evaluate(bob, 'refund:approve', { entity: 'us-entity' }).allow).toBe(false)
  })

  it('blocks maker-checker self-approval', () => {
    const bob = user('usr_bob')
    const decision = evaluate(bob, 'refund:approve', { initiatorId: bob.id })
    expect(decision.allow).toBe(false)
    expect(decision.reason).toMatch(/Maker-checker/)
  })

  it('requires MFA for sensitive permissions', () => {
    const ivan = { ...user('usr_ivan'), mfaEnrolled: false }
    expect(evaluate(ivan, 'payment:execute').allow).toBe(false)
    expect(evaluate(ivan, 'payment:execute').reason).toMatch(/MFA/)
  })

  it('attaches change-management obligations to production flag approvals', () => {
    const bob = user('usr_bob')
    const decision = evaluate(bob, 'flag:approve', { environment: 'production', riskTier: 'regulated' })
    expect(decision.allow).toBe(true)
    expect(decision.obligations.some((o) => /compliance sign-off/i.test(o))).toBe(true)
  })

  it('tiers refund approvals by amount', () => {
    expect(requiredApprovals(5_000).approvals).toBe(0)
    expect(requiredApprovals(50_000).approvals).toBe(1)
    expect(requiredApprovals(250_000).approvals).toBe(2)
    expect(requiredApprovals(900_000).approvals).toBe(3)
  })

  it('requires each approval slot to be filled by a distinct function, not just a head-count', () => {
    expect(outstandingApprovalSlots(250_000, ['manager'])).toEqual([['kyc_approver']])
    expect(outstandingApprovalSlots(250_000, ['manager', 'manager'])).toEqual([['kyc_approver']])
    expect(outstandingApprovalSlots(900_000, ['kyc_approver', 'manager', 'director'])).toEqual([])

    const secondManager = { ...user('usr_bob'), id: 'usr_bob2', scope: '*' }
    const denied = evaluate(secondManager, 'refund:approve', { amountMinor: 250_000, approvedRoles: ['manager'] })
    expect(denied.allow).toBe(false)
    expect(denied.reason).toMatch(/MLRO/)
    expect(evaluate(user('usr_hana'), 'refund:approve', { amountMinor: 250_000, approvedRoles: ['manager'] }).allow).toBe(true)
    expect(evaluate(user('usr_kai'), 'refund:approve', { amountMinor: 250_000, approvedRoles: ['manager'] }).allow).toBe(false)
    expect(evaluate(user('usr_kai'), 'refund:approve', { amountMinor: 900_000, approvedRoles: ['manager', 'kyc_approver'] }).allow).toBe(true)
  })
})

describe('segregation of duties', () => {
  it('prevents a KYC reviewer becoming a KYC approver', () => {
    expect(findSoDConflict(['kyc_reviewer'], 'kyc_approver')?.conflictWith).toBe('kyc_reviewer')
  })
  it('prevents combining payout execution with payout approval', () => {
    expect(findSoDConflict(['manager'], 'payments_operator')).not.toBeNull()
    expect(findSoDConflict(['analyst'], 'viewer')).toBeNull()
    expect(findSoDConflict(['director'], 'payments_operator')).not.toBeNull()
  })
  it('keeps experiment and flag governance away from viewers', () => {
    expect(hasPermission({ roles: ['viewer'] }, 'flag:approve')).toBe(false)
    expect(hasPermission({ roles: ['experiment_owner'] }, 'experiment:write')).toBe(true)
    expect(hasPermission({ roles: ['experiment_owner'] }, 'experiment:approve')).toBe(false)
    expect(hasPermission({ roles: ['admin'] }, 'payment:approve')).toBe(false)
  })
})

describe('audit chain', () => {
  it('verifies an untouched chain and detects a retro-active edit', () => {
    appendAudit({ eventType: 'test.one', actor: user('usr_alice'), resource: 'test', outcome: 'allow' })
    appendAudit({ eventType: 'test.two', actor: user('usr_alice'), resource: 'test', outcome: 'allow' })
    expect(verifyChain().valid).toBe(true)

    const events = db().auditEvents
    events[events.length - 2].outcome = 'deny'
    const status = verifyChain()
    expect(status.valid).toBe(false)
    expect(status.brokenAtSeq).toBe(events[events.length - 2].seq)
  })
})

describe('document encryption', () => {
  it('round-trips AES-GCM envelopes and rejects tampered ciphertext', () => {
    const envelope = encryptDocument(Buffer.from('passport-scan'))
    expect(envelope.keyId).toBeTruthy()
    expect(decryptDocument(envelope).toString()).toBe('passport-scan')
    const tampered = { ...envelope, data: envelope.data.slice(0, -2) + 'AA' }
    expect(() => decryptDocument(tampered)).toThrow()
  })

  it('masks PII deterministically', () => {
    expect(maskEmail('grace.okafor@northwind.fi')).not.toContain('grace.okafor')
    expect(maskEmail('grace.okafor@northwind.fi')).toContain('@northwind.fi')
  })
})

describe('payments ledger', () => {
  it('rejects unbalanced postings and keeps the book balanced', () => {
    expect(isBalanced()).toBe(true)
    expect(() =>
      post('pay_test', [
        { account: 'refunds_payable', direction: 'debit', amountMinor: 100, currency: 'EUR', memo: 'test' },
        { account: 'cash_clearing', direction: 'credit', amountMinor: 90, currency: 'EUR', memo: 'test' },
      ]),
    ).toThrow(/Unbalanced/)
    post('pay_test', [
      { account: 'refunds_payable', direction: 'debit', amountMinor: 100, currency: 'EUR', memo: 'test' },
      { account: 'cash_clearing', direction: 'credit', amountMinor: 100, currency: 'EUR', memo: 'test' },
    ])
    expect(isBalanced()).toBe(true)
  })
})

describe('stream ingestion', () => {
  it('accepts signed events, redacts PII at ingress and rejects bad signatures', () => {
    const raw = JSON.stringify({ paymentId: 'pay_1', customerEmail: 'a@b.c', status: 'settled' })
    const connector = db().connectors.find((c) => c.id === 'cnx_8002')
    if (!connector) throw new Error('seed connector missing')
    connector.piiFields = ['customerEmail']

    const good = ingest('cnx_8002', raw, signPayload(connector.secretRef, raw))
    expect(good.accepted).toBe(true)
    expect(good.event.payload.customerEmail).toBe('[redacted:pii]')

    const bad = ingest('cnx_8002', raw, 'deadbeef')
    expect(bad.accepted).toBe(false)
    expect(bad.event.status).toBe('rejected')

    const dlq = ingest('cnx_8002', 'not-json', signPayload(connector.secretRef, 'not-json'))
    expect(dlq.event.status).toBe('dead_lettered')
    expect(connector.dlqDepth).toBe(1)
  })

  it('uses constant-time HMAC verification', () => {
    const signature = hmac('secret', 'payload')
    expect(verifySignature('secret', 'payload', signature)).toBe(true)
    expect(verifySignature('secret', 'payload', signature.slice(0, -1) + '0')).toBe(false)
    expect(verifySignature('secret', 'payload', 'short')).toBe(false)
  })
})
