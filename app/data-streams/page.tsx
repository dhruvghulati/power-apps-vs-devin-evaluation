"use client"

import { useEffect, useState } from "react"
import { Activity, Radio, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { apiSend, relative, useApi } from "@/lib/client/api"

interface Connector {
  id: string
  name: string
  kind: string
  topic: string
  status: string
  eventsToday: number
  dlqDepth: number
  piiFields: string[]
  signatureAlgorithm: string
}

interface StreamEvent {
  id: string
  connectorId: string
  topic: string
  receivedAt: string
  payload: Record<string, unknown>
  signatureValid: boolean
  status: "accepted" | "rejected" | "dead_lettered" | "replayed"
  error?: string
}

interface LiveEvent {
  type?: string
  id?: string
  seq?: number
  eventType?: string
  topic?: string
  status?: string
  outcome?: string
  actorEmail?: string
  seenAt?: string
}

interface StreamsPayload {
  connectors: Connector[]
  events: StreamEvent[]
  health: { connected: number; degraded: number; dlqDepth: number; eventsToday: number }
}

const EVENT_TONE: Record<string, string> = {
  accepted: "text-emerald-600",
  replayed: "text-emerald-600",
  rejected: "text-red-600",
  dead_lettered: "text-amber-600",
}

export default function LiveStreamsPage() {
  const { data, loading, error, reload } = useApi<StreamsPayload>("/api/streams")
  const { can } = useSession()
  const [live, setLive] = useState<LiveEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [chosenConnector, setChosenConnector] = useState("")
  const [payload, setPayload] = useState('{"payoutId": "pay_9001", "status": "settled", "customerEmail": "amara.okafor@example.com", "amountMinor": 125000}')
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success" | "error"; message: string } | null>(null)

  useEffect(() => {
    const source = new EventSource("/api/streams/live")
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as LiveEvent
      if (event.type === "connected") return
      const seenAt = new Date().toLocaleTimeString()
      setLive((current) => [{ ...event, seenAt }, ...current].slice(0, 60))
    }
    return () => source.close()
  }, [])

  const connectors = data?.connectors ?? []
  const connectorId = chosenConnector || (connectors.find((connector) => connector.kind === "webhook")?.id ?? connectors[0]?.id ?? "")

  const simulate = async (signed: boolean) => {
    setFeedback(null)
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const result = await apiSend<{ event: StreamEvent }>("/api/streams/simulate", "POST", { connectorId, payload: parsed, signed })
      setFeedback({ kind: "success", message: `Event ${result.event.id} ${result.event.status}; PII fields were redacted at ingress.` })
      await reload()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Request failed"
      setFeedback({ kind: signed ? "denied" : "success", message: signed ? message : `Rejected as expected: ${message}` })
      await reload()
    }
  }

  const replay = async (eventId: string) => {
    setFeedback(null)
    try {
      await apiSend("/api/streams/simulate", "POST", { replayEventId: eventId })
      setFeedback({ kind: "success", message: `Event ${eventId} replayed from the dead-letter queue.` })
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  const selected = connectors.find((connector) => connector.id === connectorId)

  return (
    <div>
      <PageHeader
        title="Live streams"
        description="Signed event ingestion with PII redaction at the edge, a dead-letter queue with governed replay, and a server-sent live feed of stream and audit activity."
        actions={
          <Badge variant="outline" className={connected ? "text-emerald-600" : "text-amber-600"}>
            <Radio className="mr-1 size-3" /> {connected ? "live feed connected" : "reconnecting…"}
          </Badge>
        }
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="denied">{error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}
        {loading ? <Loading /> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Connected" value={data?.health.connected ?? 0} hint={`${data?.health.degraded ?? 0} degraded`} />
          <StatCard label="Events today" value={data?.health.eventsToday ?? 0} />
          <StatCard label="Dead-letter depth" value={data?.health.dlqDepth ?? 0} hint="Replay requires stream:replay" />
          <StatCard label="Live events (this session)" value={live.length} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Section title="Recent events" description="Payloads shown post-redaction — the raw body never reaches storage.">
              <div className="divide-y divide-border rounded-lg border border-border text-xs">
                {(data?.events ?? []).slice(0, 20).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 px-3 py-2">
                    <div className="w-40 shrink-0">
                      <div className="font-mono text-[11px]">{event.id}</div>
                      <div className="text-[10px] text-muted-foreground">{relative(event.receivedAt)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{event.topic}</span>
                        <span className={`text-[11px] ${EVENT_TONE[event.status] ?? ""}`}>{event.status.replace("_", " ")}</span>
                        {event.signatureValid ? <ShieldCheck className="size-3 text-emerald-600" /> : <ShieldAlert className="size-3 text-red-600" />}
                      </div>
                      <div className="truncate font-mono text-[10px] text-muted-foreground">{JSON.stringify(event.payload)}</div>
                      {event.error ? <div className="text-[10px] text-red-600">{event.error}</div> : null}
                    </div>
                    {event.status === "dead_lettered" ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!can("stream:replay")} onClick={() => void replay(event.id)}>
                        <RotateCcw className="mr-1 size-3" /> Replay
                      </Button>
                    ) : null}
                  </div>
                ))}
                {(data?.events ?? []).length === 0 ? <div className="px-3 py-4 text-muted-foreground">No events yet — simulate one.</div> : null}
              </div>
            </Section>

            <Section title="Live feed" description="Server-sent events: every audit entry and stream event as it happens, scoped to your permissions.">
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card/60 font-mono text-[11px]">
                {live.length === 0 ? <div className="px-3 py-4 text-muted-foreground">Waiting for activity… take an action anywhere in the app.</div> : null}
                {live.map((event, index) => (
                  <div key={`${event.id ?? event.seq}-${index}`} className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0">
                    <Activity className="size-3 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{event.seenAt}</span>
                    <span className="truncate">{event.eventType ?? event.topic}</span>
                    <span className={`ml-auto ${event.outcome === "deny" || event.status === "rejected" ? "text-red-600" : "text-muted-foreground"}`}>{event.outcome ?? event.status}</span>
                    {event.actorEmail ? <span className="text-muted-foreground">{event.actorEmail}</span> : null}
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Webhook simulator</div>
              <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={connectorId} onChange={(event) => setChosenConnector(event.target.value)}>
                {connectors.map((connector) => (
                  <option key={connector.id} value={connector.id}>
                    {connector.name} · {connector.topic}
                  </option>
                ))}
              </select>
              {selected ? (
                <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  {selected.kind} · {selected.signatureAlgorithm} · redacts {selected.piiFields.length ? selected.piiFields.join(", ") : "nothing"} · DLQ {selected.dlqDepth}
                </div>
              ) : null}
              <textarea className="h-28 w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]" value={payload} onChange={(event) => setPayload(event.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" disabled={!can("stream:manage") || !connectorId} onClick={() => void simulate(true)}>
                  Send signed
                </Button>
                <Button size="sm" variant="outline" disabled={!can("stream:manage") || !connectorId} onClick={() => void simulate(false)}>
                  Send bad signature
                </Button>
              </div>
              <div className="text-[10px] text-muted-foreground">
                A signed event is accepted, redacted and published to flows subscribed to <span className="font-mono">stream.event_accepted</span>. A bad signature is rejected with HTTP 401 and audited.
                {!can("stream:manage") ? " Your roles cannot simulate (server-enforced)." : ""}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
