"use client"

import { useState } from "react"
import { Database, KeyRound, Lock, Plug, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { formatCell } from "@/components/studio/component-renderer"
import type { DataSystem, EntityDefinition } from "@/components/studio/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiSend, relative, useApi } from "@/lib/client/api"

interface Connector {
  id: string
  name: string
  kind: string
  direction: string
  topic: string
  status: string
  secretRef: string
  signatureAlgorithm: string
  lastEventAt?: string
  eventsToday: number
  dlqDepth: number
  schemaVersion: string
  piiFields: string[]
}

interface StreamsPayload {
  connectors: Connector[]
  health: { connected: number; degraded: number; dlqDepth: number; eventsToday: number }
}

interface SamplePayload {
  system: { name: string; latencyMs: number }
  entity: EntityDefinition
  rows: Record<string, unknown>[]
  piiMasked: boolean
}

const STATUS = {
  connected: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  degraded: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  disconnected: "bg-red-500/15 text-red-700 dark:text-red-400",
} as const

const CLASS_TONE: Record<EntityDefinition["classification"], string> = {
  public: "",
  internal: "",
  confidential: "text-amber-700 dark:text-amber-400",
  restricted: "text-red-700 dark:text-red-400",
}

export default function ConnectionsPage() {
  const sources = useApi<{ systems: DataSystem[] }>("/api/datasources")
  const streams = useApi<StreamsPayload>("/api/streams")
  const { can } = useSession()
  const [selected, setSelected] = useState<{ system: DataSystem; entity: EntityDefinition } | null>(null)
  const [environment, setEnvironment] = useState("production")
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success"; message: string } | null>(null)
  const [draft, setDraft] = useState({ name: "", kind: "webhook", topic: "", secretRef: "vault://kv/data/", piiFields: "" })

  const sampleUrl = selected ? `/api/datasources/${selected.system.id}/${selected.entity.id}?limit=6` : null
  const sample = useApi<SamplePayload>(sampleUrl)

  const createConnector = async () => {
    setFeedback(null)
    try {
      await apiSend("/api/streams", "POST", { ...draft, piiFields: draft.piiFields.split(",").map((field) => field.trim()).filter(Boolean) })
      setFeedback({ kind: "success", message: "Connector registered. Only the vault reference is stored; the secret itself never touches this system." })
      setDraft({ name: "", kind: "webhook", topic: "", secretRef: "vault://kv/data/", piiFields: "" })
      await streams.reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  const systems = sources.data?.systems ?? []

  return (
    <div>
      <PageHeader
        title="Connections"
        description="The data sources a maker can bind to. Each entity is classified, its PII fields are marked, and DLP decides per environment whether it may be used at all — the same rules the solution checker enforces on publish."
        actions={
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={environment} onChange={(event) => setEnvironment(event.target.value)}>
            <option value="development">DLP view: development</option>
            <option value="staging">DLP view: staging</option>
            <option value="production">DLP view: production</option>
          </select>
        }
      />

      <div className="space-y-6 p-6">
        {sources.error ? <Notice kind="denied">{sources.error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}
        {sources.loading ? <Loading /> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Systems" value={systems.length} hint={`${systems.filter((system) => system.status === "connected").length} healthy`} />
          <StatCard label="Bindable entities" value={systems.reduce((sum, system) => sum + system.entities.filter((entity) => entity.bindable).length, 0)} hint="With your permissions" />
          <StatCard label="Restricted entities" value={systems.reduce((sum, system) => sum + system.entities.filter((entity) => entity.classification === "restricted").length, 0)} />
          <StatCard label="Stream connectors" value={streams.data?.connectors.length ?? 0} hint={`${streams.data?.health.eventsToday ?? 0} events today`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Section title="Data systems" description="Click an entity to browse its schema and a governed sample.">
            <div className="grid gap-3 md:grid-cols-2">
              {systems.map((system) => {
                const env = system.environments.find((entry) => entry.environment === environment)
                return (
                  <Card key={system.id} className={env && !env.allowed ? "border-destructive/40" : ""}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <div className="rounded-md bg-primary/10 p-2">
                            <Database className="size-4 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{system.name}</div>
                            <div className="text-[11px] text-muted-foreground">{system.vendor}</div>
                          </div>
                        </div>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATUS[system.status]}`}>{system.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[10px]">
                        <Badge variant="outline">{system.protocol}</Badge>
                        <Badge variant="outline">
                          <KeyRound className="mr-1 size-3" /> {system.auth}
                        </Badge>
                        <Badge variant="outline">{system.residency}</Badge>
                        <Badge variant="outline">{system.refresh}</Badge>
                        <Badge variant="outline">{system.latencyMs} ms</Badge>
                        {env ? (
                          <Badge variant="outline" className={env.allowed ? "" : "border-destructive/50 text-destructive"}>
                            <ShieldCheck className="mr-1 size-3" /> {env.allowed ? env.group : `blocked in ${environment}`}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="divide-y divide-border rounded-md border border-border">
                        {system.entities.map((entity) => (
                          <button
                            key={entity.id}
                            onClick={() => setSelected({ system, entity })}
                            disabled={!entity.bindable}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60 ${selected?.entity.id === entity.id && selected.system.id === system.id ? "bg-primary/5" : ""}`}
                          >
                            <span className="font-medium">{entity.name}</span>
                            <span className={`text-[10px] ${CLASS_TONE[entity.classification]}`}>{entity.classification}</span>
                            {entity.piiFields.length ? <span className="text-[10px] text-muted-foreground">PII ×{entity.piiFields.length}</span> : null}
                            <span className="ml-auto text-[10px] text-muted-foreground">{entity.fields.length} fields</span>
                            {!entity.bindable ? <Lock className="size-3 text-muted-foreground" /> : null}
                          </button>
                        ))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">owner {system.owner}</div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </Section>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Schema & governed sample</div>
                {!selected ? <div className="text-xs text-muted-foreground">Select an entity to inspect it.</div> : null}
                {selected ? (
                  <>
                    <div>
                      <div className="text-sm font-medium">{selected.entity.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {selected.system.name} · {selected.entity.description}
                      </div>
                    </div>
                    <div className="divide-y divide-border rounded-md border border-border text-[11px]">
                      {selected.entity.fields.map((field) => (
                        <div key={field.name} className="flex items-center gap-2 px-2 py-1">
                          <span className="font-mono">{field.name}</span>
                          <span className="text-muted-foreground">{field.type}</span>
                          {field.pii ? (
                            <Badge variant="outline" className="text-[9px]">
                              PII · masked unless cleared
                            </Badge>
                          ) : null}
                          <span className="ml-auto truncate text-muted-foreground">{field.description}</span>
                        </div>
                      ))}
                    </div>
                    {sample.error ? <Notice kind="denied">{sample.error}</Notice> : null}
                    {sample.data ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          Sample ({sample.data.rows.length} rows, {sample.data.system.latencyMs} ms)
                          {sample.data.piiMasked ? (
                            <Badge variant="outline" className="text-[9px]">
                              PII masked for you
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px]">
                              PII visible (cleared role)
                            </Badge>
                          )}
                        </div>
                        <div className="overflow-x-auto rounded-md border border-border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {selected.entity.fields.slice(0, 4).map((field) => (
                                  <TableHead key={field.name} className="text-[10px]">
                                    {field.name}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {sample.data.rows.map((row, index) => (
                                <TableRow key={index}>
                                  {selected.entity.fields.slice(0, 4).map((field) => (
                                    <TableCell key={field.name} className="text-[11px]">
                                      {formatCell(field.name, row[field.name], row)}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="text-[10px] text-muted-foreground">Every sample read is audited with classification and masking state.</div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Plug className="size-3.5" /> Stream connectors
                </div>
                {streams.error ? <Notice kind="denied">{streams.error}</Notice> : null}
                <div className="divide-y divide-border rounded-md border border-border text-xs">
                  {(streams.data?.connectors ?? []).map((connector) => (
                    <div key={connector.id} className="space-y-0.5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{connector.name}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${STATUS[connector.status as keyof typeof STATUS] ?? ""}`}>{connector.status}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{connector.eventsToday} today · DLQ {connector.dlqDepth}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {connector.kind} · {connector.direction} · {connector.topic} · {connector.signatureAlgorithm} · schema {connector.schemaVersion} · last {relative(connector.lastEventAt)}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">{connector.secretRef}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  <div className="text-[11px] font-medium">Register a connector</div>
                  <Input className="h-7 text-xs" placeholder="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="h-7 rounded-md border border-input bg-background px-2 text-xs" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value })}>
                      {["webhook", "kafka", "kinesis", "postgres_cdc", "snowflake", "sftp"].map((kind) => (
                        <option key={kind}>{kind}</option>
                      ))}
                    </select>
                    <Input className="h-7 text-xs" placeholder="topic.name" value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })} />
                  </div>
                  <Input className="h-7 font-mono text-xs" placeholder="vault://kv/data/…" value={draft.secretRef} onChange={(event) => setDraft({ ...draft, secretRef: event.target.value })} />
                  <Input className="h-7 text-xs" placeholder="PII fields to redact at ingress (comma-separated)" value={draft.piiFields} onChange={(event) => setDraft({ ...draft, piiFields: event.target.value })} />
                  <Button size="sm" className="w-full" disabled={!can("stream:manage")} onClick={() => void createConnector()}>
                    Register
                  </Button>
                  {!can("stream:manage") ? <div className="text-[10px] text-muted-foreground">Requires stream:manage (server-enforced).</div> : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
