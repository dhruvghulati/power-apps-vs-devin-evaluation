import { handler, readJson, required } from '@/lib/server/api'
import { randomId } from '@/lib/server/crypto'
import { db, timestamp } from '@/lib/server/store'
import type { StreamConnector } from '@/lib/server/types'

export const GET = handler(async ({ authorize }) => {
  authorize('stream:read', { resource: 'stream_connector' })
  const store = db()
  return Response.json({
    connectors: store.connectors,
    events: store.streamEvents.slice(0, 50),
    health: {
      connected: store.connectors.filter((c) => c.status === 'connected').length,
      degraded: store.connectors.filter((c) => c.status !== 'connected').length,
      dlqDepth: store.connectors.reduce((sum, c) => sum + c.dlqDepth, 0),
      eventsToday: store.connectors.reduce((sum, c) => sum + c.eventsToday, 0),
    },
  })
})

export const POST = handler(async ({ authorize, audit }, request) => {
  authorize('stream:manage', { resource: 'stream_connector', eventType: 'connector.create.denied' })
  const body = await readJson<Partial<StreamConnector>>(request)
  const connector: StreamConnector = {
    id: randomId('cnx'),
    name: required(body.name, 'name is required.'),
    kind: required(body.kind, 'kind is required.'),
    direction: body.direction ?? 'inbound',
    topic: required(body.topic, 'topic is required.'),
    status: 'connected',
    secretRef: required(body.secretRef, 'A vault secret reference is required; raw secrets are never stored.'),
    signatureAlgorithm: body.kind === 'webhook' ? 'hmac-sha256' : 'none',
    lastEventAt: undefined,
    eventsToday: 0,
    dlqDepth: 0,
    schemaVersion: body.schemaVersion ?? 'v1.0.0',
    piiFields: body.piiFields ?? [],
  }
  db().connectors.push(connector)
  audit({
    eventType: 'connector.created',
    resource: 'stream_connector',
    resourceId: connector.id,
    outcome: 'allow',
    after: { name: connector.name, kind: connector.kind, topic: connector.topic, piiFields: connector.piiFields },
    metadata: { secretRef: connector.secretRef, createdAt: timestamp() },
  })
  return Response.json({ connector }, { status: 201 })
})
