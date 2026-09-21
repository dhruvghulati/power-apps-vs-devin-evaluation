import { found, handler, readJson } from '@/lib/server/api'
import { ingest, replay, signPayload } from '@/lib/server/streams'
import { db } from '@/lib/server/store'

interface SimulateBody {
  connectorId: string
  payload?: Record<string, unknown>
  /** Set false to send a deliberately bad signature and watch it be rejected. */
  signed?: boolean
  replayEventId?: string
}

export const POST = handler(async ({ authorize, audit }, request) => {
  const body = await readJson<SimulateBody>(request)

  if (body.replayEventId) {
    authorize('stream:replay', { resource: 'stream_event', resourceId: body.replayEventId, eventType: 'stream.replay.denied' })
    const event = replay(body.replayEventId)
    audit({ eventType: 'stream.replayed', resource: 'stream_event', resourceId: event.id, outcome: 'allow', metadata: { source: body.replayEventId } })
    return Response.json({ event })
  }

  authorize('stream:manage', { resource: 'stream_connector', resourceId: body.connectorId, eventType: 'stream.simulate.denied' })
  const connector = found(db().connectors.find((c) => c.id === body.connectorId), 'Connector not found.')
  const raw = JSON.stringify(body.payload ?? { emittedAt: new Date().toISOString(), source: 'console-simulator' })
  const signature = body.signed === false ? 'deadbeef' : signPayload(connector.secretRef, raw)
  const { event, accepted } = ingest(connector.id, raw, signature)

  audit({
    eventType: accepted ? 'stream.event_accepted' : 'stream.event_rejected',
    resource: 'stream_event',
    resourceId: event.id,
    outcome: accepted ? 'allow' : 'deny',
    reason: event.error,
    metadata: { simulated: true, signatureValid: event.signatureValid },
  })
  return Response.json({ event }, { status: accepted ? 202 : 401 })
})
