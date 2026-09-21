import { publish } from './audit'
import { hmac, randomId, verifySignature } from './crypto'
import { db, timestamp } from './store'
import type { StreamEvent } from './types'

/**
 * Demo secret resolution. `secretRef` points at a vault path in production;
 * here every connector shares a derived demo secret so signatures are real.
 */
export function connectorSecret(secretRef: string): string {
  return hmac(process.env.STREAM_SECRET ?? 'demo-stream-secret', secretRef)
}

export function signPayload(secretRef: string, payload: string): string {
  return hmac(connectorSecret(secretRef), payload)
}

export interface IngestResult {
  event: StreamEvent
  accepted: boolean
}

export function ingest(connectorId: string, rawBody: string, signature: string): IngestResult {
  const store = db()
  const connector = store.connectors.find((c) => c.id === connectorId)
  if (!connector) throw new Error(`Unknown connector ${connectorId}`)

  const signatureValid =
    connector.signatureAlgorithm === 'none' || verifySignature(connectorSecret(connector.secretRef), rawBody, signature)

  let payload: Record<string, unknown> = {}
  let parseError: string | undefined
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    parseError = 'Payload is not valid JSON'
  }

  const event: StreamEvent = {
    id: randomId('evt'),
    connectorId: connector.id,
    topic: connector.topic,
    receivedAt: timestamp(),
    payload: redactPii(payload, connector.piiFields),
    signatureValid,
    status: !signatureValid ? 'rejected' : parseError ? 'dead_lettered' : 'accepted',
    error: !signatureValid ? 'HMAC signature verification failed' : parseError,
  }

  store.streamEvents.unshift(event)
  store.streamEvents = store.streamEvents.slice(0, 200)
  connector.lastEventAt = event.receivedAt
  connector.eventsToday += 1
  if (event.status === 'dead_lettered') connector.dlqDepth += 1
  publish(event)

  return { event, accepted: event.status === 'accepted' }
}

export function replay(eventId: string): StreamEvent {
  const store = db()
  const original = store.streamEvents.find((e) => e.id === eventId)
  if (!original) throw new Error(`Unknown event ${eventId}`)
  const connector = store.connectors.find((c) => c.id === original.connectorId)
  const replayed: StreamEvent = {
    ...original,
    id: randomId('evt'),
    receivedAt: timestamp(),
    status: 'replayed',
    error: undefined,
  }
  original.status = 'accepted'
  if (connector && connector.dlqDepth > 0) connector.dlqDepth -= 1
  store.streamEvents.unshift(replayed)
  publish(replayed)
  return replayed
}

/** Field-level redaction at the edge: PII never lands in the event log. */
function redactPii(payload: Record<string, unknown>, piiFields: string[]): Record<string, unknown> {
  if (piiFields.length === 0) return payload
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => (piiFields.includes(key) ? [key, '[redacted:pii]'] : [key, value])),
  )
}
