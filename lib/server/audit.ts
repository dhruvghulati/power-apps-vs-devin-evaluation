import { randomId, sha256 } from './crypto'
import { db, timestamp } from './store'
import type { AuditEvent, RoleId, StreamEvent, User } from './types'

const GENESIS = '0'.repeat(64)

export interface AuditInput {
  eventType: string
  actor: Pick<User, 'id' | 'email' | 'roles'> | { id: string; email: string; roles: RoleId[] }
  resource: string
  resourceId?: string
  outcome: 'allow' | 'deny' | 'error'
  reason?: string
  ipAddress?: string
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
}

/**
 * Append-only write. Each record commits to the previous record's hash, so any
 * retro-active edit or deletion breaks verification for every later record.
 */
export function appendAudit(input: AuditInput): AuditEvent {
  const store = db()
  const previous = store.auditEvents[store.auditEvents.length - 1]
  const previousHash = previous?.hash ?? GENESIS
  const base = {
    seq: (previous?.seq ?? 0) + 1,
    id: randomId('evt'),
    eventType: input.eventType,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRoles: snapshot(input.actor.roles),
    resource: input.resource,
    resourceId: input.resourceId,
    outcome: input.outcome,
    reason: input.reason,
    timestamp: timestamp(),
    ipAddress: input.ipAddress ?? '127.0.0.1',
    before: snapshot(input.before ?? null),
    after: snapshot(input.after ?? null),
    metadata: input.metadata === undefined ? undefined : snapshot(input.metadata),
    previousHash,
  }
  const event: AuditEvent = { ...base, hash: sha256(canonical(base)) }
  store.auditEvents.push(event)
  publish(event)
  return event
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v instanceof Map ? [...v.entries()] : v))
}

/**
 * Audit records must be immutable once hashed. Callers pass live domain objects
 * (a user's roles array, a refund), so we persist a detached copy of exactly the
 * bytes that were hashed rather than a reference that later mutations would alter.
 */
function snapshot<T>(value: T): T {
  if (value === null || value === undefined) return value
  return JSON.parse(canonical(value)) as T
}

export interface ChainStatus {
  valid: boolean
  totalEvents: number
  latestHash: string
  brokenAtSeq?: number
  verifiedAt: string
}

/** Recomputes every hash; this is the evidence an auditor asks for. */
export function verifyChain(): ChainStatus {
  const events = db().auditEvents
  let previousHash = GENESIS
  for (const event of events) {
    const { hash, ...rest } = event
    if (event.previousHash !== previousHash || sha256(canonical(rest)) !== hash) {
      return { valid: false, totalEvents: events.length, latestHash: previousHash, brokenAtSeq: event.seq, verifiedAt: timestamp() }
    }
    previousHash = hash
  }
  return { valid: true, totalEvents: events.length, latestHash: previousHash, verifiedAt: timestamp() }
}

export function subscribe(listener: (event: AuditEvent | StreamEvent) => void): () => void {
  const store = db()
  store.subscribers.add(listener)
  return () => store.subscribers.delete(listener)
}

export function publish(event: AuditEvent | StreamEvent): void {
  for (const listener of db().subscribers) {
    try {
      listener(event)
    } catch {
      // A failing subscriber must never break the write path.
    }
  }
}

const HISTORY: AuditInput[] = [
  { eventType: 'session.login', actor: { id: 'usr_bob', email: 'bob.smith@northwind.fi', roles: ['manager'] }, resource: 'session', outcome: 'allow' },
  { eventType: 'refund.approved', actor: { id: 'usr_bob', email: 'bob.smith@northwind.fi', roles: ['manager'] }, resource: 'refund', resourceId: 'rfd_1006', outcome: 'allow', after: { status: 'approved' } },
  { eventType: 'payment.settled', actor: { id: 'usr_ivan', email: 'ivan.petrov@northwind.fi', roles: ['payments_operator'] }, resource: 'payment', resourceId: 'pay_9001', outcome: 'allow', after: { status: 'settled' } },
  { eventType: 'kyc.decided', actor: { id: 'usr_hana', email: 'hana.yilmaz@northwind.fi', roles: ['kyc_approver'] }, resource: 'kyc_case', resourceId: 'kyc_2005', outcome: 'allow', after: { status: 'approved' } },
  { eventType: 'sod.blocked', actor: { id: 'usr_alice', email: 'alice.johnson@northwind.fi', roles: ['admin'] }, resource: 'user', resourceId: 'usr_dan', outcome: 'deny', reason: 'One identity cannot both raise and approve a refund (maker-checker).' },
  { eventType: 'document.downloaded', actor: { id: 'usr_grace', email: 'grace.okafor@northwind.fi', roles: ['kyc_reviewer'] }, resource: 'kyc_document', resourceId: 'doc_3001', outcome: 'allow' },
]

export function ensureAuditHistory(): void {
  if (db().auditEvents.length > 0) return
  for (const entry of HISTORY) appendAudit(entry)
}
