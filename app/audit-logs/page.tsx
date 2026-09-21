"use client"

import { useMemo, useState } from "react"
import { Download } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { relative, useApi } from "@/lib/client/api"

interface AuditEvent {
  id: string
  seq: number
  timestamp: string
  eventType: string
  actorId: string
  actorEmail: string
  actorRoles: string[]
  resource: string
  resourceId?: string
  outcome: "allow" | "deny" | "error"
  reason?: string
  ipAddress: string
  hash: string
  previousHash: string
}

interface AuditPayload {
  events: AuditEvent[]
  total: number
  chain: { valid: boolean; totalEvents: number; latestHash: string; verifiedAt: string; brokenAtSeq?: number }
  piiMasked: boolean
}

export default function AuditLogsPage() {
  const [eventType, setEventType] = useState("")
  const [outcome, setOutcome] = useState("")
  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (eventType) params.set("eventType", eventType)
    if (outcome) params.set("outcome", outcome)
    return `/api/audit${params.size ? `?${params.toString()}` : ""}`
  }, [eventType, outcome])

  const { data, loading, error } = useApi<AuditPayload>(query)
  const { can } = useSession()
  const events = data?.events ?? []

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="Append-only, hash-chained events. Each record stores the hash of its predecessor, so any edit or deletion breaks verification — including denied attempts, which are recorded as evidence rather than discarded."
        actions={
          <>
            <Badge variant={data?.chain.valid ? "secondary" : "destructive"}>
              {data?.chain.valid ? "Chain verified" : `Chain broken at seq ${data?.chain.brokenAtSeq}`}
            </Badge>
            <Button size="sm" variant="outline" disabled={!can("audit:export")} onClick={() => window.open(`${query}${query.includes("?") ? "&" : "?"}format=csv`, "_blank")}>
              <Download className="size-3.5" /> Export CSV
            </Button>
          </>
        }
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Events" value={data?.chain.totalEvents ?? 0} />
          <StatCard label="Denied" value={events.filter((event) => event.outcome === "deny").length} hint="Policy refusals in this view" />
          <StatCard label="Matching filter" value={data?.total ?? 0} />
          <StatCard label="PII" value={data?.piiMasked ? "Masked" : "Visible"} hint="Auditors see unmasked payloads" />
        </div>

        <Section title="Filter">
          <div className="flex flex-wrap gap-2">
            <Input className="w-64" placeholder="Event type prefix, e.g. refund." value={eventType} onChange={(event) => setEventType(event.target.value)} />
            <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
              <option value="">All outcomes</option>
              <option value="allow">allow</option>
              <option value="deny">deny</option>
              <option value="error">error</option>
            </select>
          </div>
        </Section>

        {loading ? (
          <Loading />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seq</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="tabular-nums text-xs">{event.seq}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{relative(event.timestamp)}</TableCell>
                      <TableCell className="font-mono text-xs">{event.eventType}</TableCell>
                      <TableCell className="text-xs">
                        {event.actorEmail}
                        <div className="text-[11px] text-muted-foreground">{event.actorRoles.join(", ")}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {event.resource}
                        {event.resourceId ? <div className="font-mono text-[11px] text-muted-foreground">{event.resourceId}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.outcome === "deny" ? "destructive" : event.outcome === "error" ? "outline" : "secondary"}>{event.outcome}</Badge>
                        {event.reason ? <div className="max-w-64 text-[11px] text-muted-foreground">{event.reason}</div> : null}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{event.hash.slice(0, 12)}…</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
