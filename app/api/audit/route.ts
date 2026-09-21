import { handler } from '@/lib/server/api'
import { verifyChain } from '@/lib/server/audit'
import { projectAuditEvent } from '@/lib/server/projections'
import { db } from '@/lib/server/store'

export const GET = handler(async ({ user, authorize }, request) => {
  authorize('audit:read', { resource: 'audit_event' })
  const url = new URL(request.url)
  const eventType = url.searchParams.get('eventType')
  const outcome = url.searchParams.get('outcome')
  const actorId = url.searchParams.get('actorId')
  const resource = url.searchParams.get('resource')
  const format = url.searchParams.get('format')

  const events = db()
    .auditEvents.filter((event) => !eventType || event.eventType.startsWith(eventType))
    .filter((event) => !outcome || event.outcome === outcome)
    .filter((event) => !actorId || event.actorId === actorId)
    .filter((event) => !resource || event.resource === resource)
    .slice()
    .reverse()

  if (format === 'csv') {
    authorize('audit:export', { resource: 'audit_event', eventType: 'audit.export.denied' })
    const header = 'seq,timestamp,eventType,actor,roles,resource,resourceId,outcome,reason,hash,previousHash'
    const rows = events.map((event) => {
      const projected = projectAuditEvent(event, user)
      return [
        event.seq,
        event.timestamp,
        event.eventType,
        projected.actorEmail,
        `"${event.actorRoles.join(' ')}"`,
        event.resource,
        event.resourceId ?? '',
        event.outcome,
        `"${(event.reason ?? '').replace(/"/g, "'")}"`,
        event.hash,
        event.previousHash,
      ].join(',')
    })
    const chain = verifyChain()
    const footer = `# chain_valid=${chain.valid} total_events=${chain.totalEvents} latest_hash=${chain.latestHash} exported_by=${user.email} at=${new Date().toISOString()}`
    return new Response([header, ...rows, footer].join('\n'), {
      headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="audit-trail.csv"' },
    })
  }

  return Response.json({
    events: events.slice(0, 250).map((event) => projectAuditEvent(event, user)),
    total: events.length,
    chain: verifyChain(),
    piiMasked: !user.roles.some((role) => role === 'auditor'),
  })
})
