import { found, handler } from '@/lib/server/api'
import { verifyChain } from '@/lib/server/audit'
import { evaluate } from '@/lib/server/policy'
import { projectAuditEvent, projectKycCase, projectPayment, projectRefund } from '@/lib/server/projections'
import { db } from '@/lib/server/store'
import type { DataResource } from '@/lib/server/studio-types'

const RESOURCE_PERMISSION = {
  refunds: 'refund:read',
  kyc: 'kyc:read',
  payments: 'payment:read',
  audit: 'audit:read',
  flags: 'flag:read',
} as const

/**
 * Runtime data for a generated app. The bound resource is re-authorized per
 * request: a maker cannot widen access by dropping a component onto a screen.
 */
export const GET = handler(async ({ user, authorize }, request, params) => {
  authorize('app:read', { resource: 'app', resourceId: params.id })
  const app = found(db().apps.find((candidate) => candidate.id === params.id), 'App not found.')
  const url = new URL(request.url)
  const resource = (url.searchParams.get('resource') ?? app.resource) as DataResource
  const permission = RESOURCE_PERMISSION[resource]
  const decision = evaluate(user, permission)
  if (!decision.allow)
    return Response.json({ error: decision.reason, resource, permission, rows: [], kpis: [] }, { status: 403 })

  const store = db()
  const inScope = <T extends { entity?: string }>(rows: T[]) =>
    user.scope === '*' ? rows : rows.filter((row) => !row.entity || row.entity === user.scope)

  switch (resource) {
    case 'refunds': {
      const rows = inScope(store.refunds).map((refund) => projectRefund(refund, user))
      return Response.json({
        resource,
        rows,
        kpis: [
          { label: 'Open', value: store.refunds.filter((r) => r.status === 'pending').length },
          { label: 'Approved', value: store.refunds.filter((r) => r.status === 'approved').length },
          { label: 'Paid', value: store.refunds.filter((r) => r.status === 'paid').length },
          { label: 'High priority', value: store.refunds.filter((r) => r.priority === 'high').length },
        ],
      })
    }
    case 'kyc': {
      const rows = inScope(store.kycCases).map((kycCase) => projectKycCase(kycCase, user))
      return Response.json({
        resource,
        rows,
        kpis: [
          { label: 'In review', value: store.kycCases.filter((c) => c.status === 'in_review').length },
          { label: 'Escalated', value: store.kycCases.filter((c) => c.status === 'escalated').length },
          { label: 'Past SLA', value: store.kycCases.filter((c) => new Date(c.slaDueAt).getTime() < Date.now() && !['approved', 'rejected'].includes(c.status)).length },
          { label: 'Documents', value: store.documents.length },
        ],
      })
    }
    case 'payments': {
      const rows = store.payments.map(projectPayment)
      return Response.json({
        resource,
        rows,
        kpis: [
          { label: 'Awaiting release', value: store.payments.filter((p) => p.status === 'requires_approval' || p.status === 'authorized').length },
          { label: 'Settled', value: store.payments.filter((p) => p.status === 'settled').length },
          { label: 'Failed', value: store.payments.filter((p) => p.status === 'failed').length },
          { label: 'Ledger entries', value: store.ledger.length },
        ],
      })
    }
    case 'flags': {
      return Response.json({
        resource,
        rows: store.flags.map((flag) => ({
          id: flag.id,
          key: flag.key,
          owner: flag.owner,
          riskTier: flag.riskTier,
          production: flag.environments.production.enabled ? `on ${flag.environments.production.rolloutPercent}%` : 'off',
          killed: flag.killed,
        })),
        kpis: [
          { label: 'Flags', value: store.flags.length },
          { label: 'Regulated', value: store.flags.filter((f) => f.riskTier === 'regulated').length },
          { label: 'Pending changes', value: store.changeRequests.filter((c) => c.status === 'pending').length },
          { label: 'Running experiments', value: store.experiments.filter((e) => e.status === 'running').length },
        ],
      })
    }
    case 'audit': {
      const chain = verifyChain()
      return Response.json({
        resource,
        rows: store.auditEvents.slice(-100).reverse().map((event) => projectAuditEvent(event, user)),
        kpis: [
          { label: 'Events', value: chain.totalEvents },
          { label: 'Chain', value: chain.valid ? 'verified' : 'broken' },
          { label: 'Denied', value: store.auditEvents.filter((e) => e.outcome === 'deny').length },
          { label: 'Actors', value: new Set(store.auditEvents.map((e) => e.actorId)).size },
        ],
      })
    }
  }
})
