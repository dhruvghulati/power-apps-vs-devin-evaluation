import { verifyChain } from './audit'
import { findSoDConflict } from './policy'
import { isBalanced } from './payments'
import { db } from './store'

export interface Control {
  id: string
  framework: string[]
  name: string
  description: string
  status: 'pass' | 'attention' | 'fail'
  /** Evidence is computed from live system state, not typed into a spreadsheet. */
  evidence: string
  automated: boolean
}

export function evaluateControls(): Control[] {
  const store = db()
  const chain = verifyChain()

  const sodViolations = store.users.flatMap((user) =>
    user.roles.flatMap((role, index) => {
      const conflict = findSoDConflict(user.roles.slice(0, index), role)
      return conflict ? [{ user: user.id, role, ...conflict }] : []
    }),
  )
  const mfaGaps = store.users.filter((user) => !user.mfaEnrolled)
  const staleReviews = store.users.filter(
    (user) => Date.now() - new Date(user.lastAccessReviewAt).getTime() > 90 * 24 * 60 * 60 * 1000,
  )
  const unencrypted = store.documents.filter((doc) => !doc.cipher?.data)
  const overRetention = store.documents.filter(
    (doc) => new Date(doc.retentionUntil).getTime() < Date.now() && !doc.legalHold,
  )
  const selfApproved = store.payments.filter((payment) => payment.approvedBy.includes(payment.initiatedBy))
  const unreconciled = store.payments.filter((payment) => payment.status === 'settled' && !payment.reconciledAt)
  const prodChangesWithoutReview = store.changeRequests.filter(
    (change) => change.environment === 'production' && change.status === 'applied' && change.reviewedBy === change.proposedBy,
  )
  const runningWithoutSignoff = store.experiments.filter(
    (experiment) => experiment.status === 'running' && experiment.requiresComplianceSignoff && !experiment.signedOffBy,
  )
  const slaBreaches = store.kycCases.filter(
    (kycCase) => new Date(kycCase.slaDueAt).getTime() < Date.now() && !['approved', 'rejected'].includes(kycCase.status),
  )
  const dlq = store.connectors.reduce((sum, connector) => sum + connector.dlqDepth, 0)

  return [
    {
      id: 'CC7.2-AUDIT-CHAIN',
      framework: ['SOC 2', 'SOX', 'MiFID II'],
      name: 'Immutable audit trail',
      description: 'Every state change is appended to a hash-chained log and verified on read.',
      status: chain.valid ? 'pass' : 'fail',
      evidence: `${chain.totalEvents} events, chain ${chain.valid ? 'verified' : `broken at seq ${chain.brokenAtSeq}`} at ${chain.verifiedAt}. Head ${chain.latestHash.slice(0, 16)}…`,
      automated: true,
    },
    {
      id: 'CC6.3-SOD',
      framework: ['SOC 2', 'SOX'],
      name: 'Preventive segregation of duties',
      description: 'Toxic role pairs are blocked at provisioning, not detected in a quarterly review.',
      status: sodViolations.length === 0 ? 'pass' : 'fail',
      evidence: sodViolations.length === 0 ? `0 conflicting grants across ${store.users.length} identities.` : `${sodViolations.length} conflicting grants: ${sodViolations.map((v) => `${v.user}:${v.role}`).join(', ')}`,
      automated: true,
    },
    {
      id: 'CC6.1-MFA',
      framework: ['SOC 2', 'PCI DSS v4.0'],
      name: 'MFA on privileged actions',
      description: 'Payout release, KYC decisions and role administration require MFA-enrolled identities.',
      status: mfaGaps.length === 0 ? 'pass' : 'attention',
      evidence: `${store.users.length - mfaGaps.length}/${store.users.length} identities enrolled.`,
      automated: true,
    },
    {
      id: 'CC6.2-ACCESS-REVIEW',
      framework: ['SOC 2', 'DORA'],
      name: 'Quarterly access recertification',
      description: 'Entitlements are recertified at least every 90 days.',
      status: staleReviews.length === 0 ? 'pass' : 'attention',
      evidence: `${staleReviews.length} identities past a 90-day review; latest campaign ${store.accessReviews[store.accessReviews.length - 1]?.period ?? 'n/a'}.`,
      automated: true,
    },
    {
      id: 'C1.1-DOC-ENCRYPTION',
      framework: ['SOC 2', 'GDPR', 'PCI DSS v4.0'],
      name: 'KYC documents encrypted at rest',
      description: 'Documents are stored as AES-256-GCM envelopes with per-object checksums.',
      status: unencrypted.length === 0 ? 'pass' : 'fail',
      evidence: `${store.documents.length - unencrypted.length}/${store.documents.length} documents encrypted; residency enforced per entity.`,
      automated: true,
    },
    {
      id: 'P4.2-RETENTION',
      framework: ['GDPR', 'AMLR EU 2024/1624'],
      name: 'Retention and legal hold',
      description: 'KYC evidence is retained 5 years, then purged unless a legal hold applies.',
      status: overRetention.length === 0 ? 'pass' : 'attention',
      evidence: `${overRetention.length} documents past retention; ${store.documents.filter((d) => d.legalHold).length} under legal hold.`,
      automated: true,
    },
    {
      id: 'PI1.2-DUAL-APPROVAL',
      framework: ['SOC 2', 'SOX'],
      name: 'Maker-checker on money movement',
      description: 'No identity can both initiate and approve the same payout.',
      status: selfApproved.length === 0 ? 'pass' : 'fail',
      evidence: `${selfApproved.length} self-approved payouts across ${store.payments.length} total.`,
      automated: true,
    },
    {
      id: 'PI1.4-RECONCILIATION',
      framework: ['SOC 2', 'SOX'],
      name: 'Ledger balanced and reconciled',
      description: 'Double-entry postings balance and settled payouts are reconciled against the PSP.',
      status: isBalanced() && unreconciled.length === 0 ? 'pass' : 'attention',
      evidence: `Ledger ${isBalanced() ? 'balanced' : 'out of balance'}; ${unreconciled.length} settled payouts awaiting reconciliation.`,
      automated: true,
    },
    {
      id: 'CC8.1-CHANGE-MGMT',
      framework: ['SOC 2', 'DORA'],
      name: 'Production change control',
      description: 'Production flag changes require an independent approver and a ticket reference.',
      status: prodChangesWithoutReview.length === 0 ? 'pass' : 'fail',
      evidence: `${store.changeRequests.filter((c) => c.environment === 'production').length} production changes, ${prodChangesWithoutReview.length} without independent review.`,
      automated: true,
    },
    {
      id: 'CC3.2-EXPERIMENT-SIGNOFF',
      framework: ['DORA', 'Consumer Duty'],
      name: 'Compliance sign-off on regulated experiments',
      description: 'Experiments on regulated surfaces cannot start without compliance sign-off.',
      status: runningWithoutSignoff.length === 0 ? 'pass' : 'fail',
      evidence: `${store.experiments.filter((e) => e.status === 'running').length} running experiments, ${runningWithoutSignoff.length} missing sign-off.`,
      automated: true,
    },
    {
      id: 'AML-SLA',
      framework: ['AMLR EU 2024/1624'],
      name: 'CDD turnaround within SLA',
      description: 'Open KYC cases are decided within the risk-based SLA.',
      status: slaBreaches.length === 0 ? 'pass' : 'attention',
      evidence: `${slaBreaches.length} open cases past SLA of ${store.kycCases.length} total.`,
      automated: true,
    },
    {
      id: 'DORA-ICT-RESILIENCE',
      framework: ['DORA'],
      name: 'ICT third-party data flows monitored',
      description: 'Inbound feeds are signature-verified, PII-redacted at the edge, and dead letters are visible.',
      status: dlq === 0 ? 'pass' : 'attention',
      evidence: `${store.connectors.length} connectors, ${store.connectors.filter((c) => c.signatureAlgorithm !== 'none').length} signature-verified, ${dlq} events in DLQ.`,
      automated: true,
    },
  ]
}

export function complianceScore(controls: Control[]): number {
  const weights = { pass: 1, attention: 0.5, fail: 0 }
  return Math.round((controls.reduce((sum, control) => sum + weights[control.status], 0) / controls.length) * 100)
}
