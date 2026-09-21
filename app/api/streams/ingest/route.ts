import { appendAudit, ensureAuditHistory } from '@/lib/server/audit'
import { ingest } from '@/lib/server/streams'
import { db } from '@/lib/server/store'

/**
 * Public ingress for external producers. Authentication is the HMAC signature
 * on the raw body, not a session, so this route deliberately bypasses
 * `handler()` and its cookie-based actor.
 */
export async function POST(request: Request): Promise<Response> {
  ensureAuditHistory()
  const connectorId = request.headers.get('x-connector-id') ?? ''
  const signature = request.headers.get('x-signature') ?? ''
  const rawBody = await request.text()
  const connector = db().connectors.find((c) => c.id === connectorId)

  if (!connector) return Response.json({ error: 'Unknown connector.' }, { status: 404 })

  const { event, accepted } = ingest(connector.id, rawBody, signature)
  appendAudit({
    eventType: accepted ? 'stream.event_accepted' : 'stream.event_rejected',
    actor: { id: `connector:${connector.id}`, email: `${connector.topic}@stream`, roles: [] },
    resource: 'stream_event',
    resourceId: event.id,
    outcome: accepted ? 'allow' : 'deny',
    reason: event.error,
    after: accepted ? event.payload : undefined,
    metadata: { topic: connector.topic, connectorId: connector.id, signatureValid: event.signatureValid },
  })

  return Response.json({ event }, { status: accepted ? 202 : 401 })
}
