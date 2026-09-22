"use client"

import { useState } from "react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiSend, relative, useApi } from "@/lib/client/api"

type Environment = "development" | "staging" | "production"

interface FeatureFlag {
  id: string
  key: string
  name: string
  description: string
  category: string
  owner: string
  riskTier: "standard" | "regulated"
  killed: boolean
  environments: Record<Environment, { enabled: boolean; rolloutPercent: number; updatedAt: string; updatedBy: string }>
}

interface ChangeRequest {
  id: string
  flagId: string
  environment: Environment
  proposedBy: string
  proposedAt: string
  justification: string
  ticket: string
  before: { enabled: boolean; rolloutPercent: number }
  after: { enabled: boolean; rolloutPercent: number }
  status: string
  reviewedBy?: string
  reviewNotes?: string
}

interface Experiment {
  id: string
  name: string
  hypothesis: string
  flagId: string
  owner: string
  status: string
  audience: { segment: string; percent: number }
  requiresComplianceSignoff: boolean
  signedOffBy?: string
  primaryMetric: string
  guardrailMetrics: string[]
}

const ENVIRONMENTS: Environment[] = ["development", "staging", "production"]

export default function FeatureFlagsPage() {
  const { data, loading, error, reload } = useApi<{ flags: FeatureFlag[]; changeRequests: ChangeRequest[]; experiments: Experiment[] }>("/api/flags")
  const { can, user } = useSession()
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success"; message: string } | null>(null)
  const [draft, setDraft] = useState({ flagId: "", environment: "production" as Environment, enabled: true, rolloutPercent: 25, justification: "", ticket: "" })
  const [notes, setNotes] = useState<Record<string, string>>({})

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setFeedback(null)
    try {
      await fn()
      setFeedback({ kind: "success", message: success })
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  const flags = data?.flags ?? []
  const pending = (data?.changeRequests ?? []).filter((request) => request.status === "pending")

  return (
    <div>
      <PageHeader
        title="Feature flags & experiments"
        description="Production and regulated flags cannot be toggled directly: they route through a change request with a ticket, a justification and an independent approver. Experiments on regulated surfaces need compliance sign-off before they can start."
        actions={<Badge variant="outline">{pending.length} pending change requests</Badge>}
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Flags" value={flags.length} />
          <StatCard label="Regulated" value={flags.filter((flag) => flag.riskTier === "regulated").length} hint="Always dual-approved" />
          <StatCard label="Killed" value={flags.filter((flag) => flag.killed).length} />
          <StatCard label="Running experiments" value={(data?.experiments ?? []).filter((experiment) => experiment.status === "running").length} />
        </div>

        {loading ? <Loading /> : null}

        <Section title="Flags">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flag</TableHead>
                    <TableHead>Risk</TableHead>
                    {ENVIRONMENTS.map((environment) => (
                      <TableHead key={environment} className="capitalize">
                        {environment}
                      </TableHead>
                    ))}
                    <TableHead>Kill switch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flags.map((flag) => (
                    <TableRow key={flag.id}>
                      <TableCell>
                        <div className="font-mono text-xs">{flag.key}</div>
                        <div className="text-[11px] text-muted-foreground">{flag.name}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={flag.riskTier === "regulated" ? "destructive" : "secondary"}>{flag.riskTier}</Badge>
                      </TableCell>
                      {ENVIRONMENTS.map((environment) => {
                        const state = flag.environments[environment]
                        return (
                          <TableCell key={environment} className="text-xs">
                            {state.enabled ? `on · ${state.rolloutPercent}%` : "off"}
                            <div className="text-[11px] text-muted-foreground">{relative(state.updatedAt)}</div>
                          </TableCell>
                        )
                      })}
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!can("flag:kill") || flag.killed}
                          onClick={() =>
                            void run(
                              () => apiSend(`/api/flags/${flag.id}/kill`, "POST", { reason: notes[flag.id] || "Incident response" }),
                              `${flag.key} disabled in every environment.`,
                            )
                          }
                        >
                          {flag.killed ? "Killed" : "Kill"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section>

        <Section title="Propose a change" description="Development changes on standard flags self-serve; everything else creates a pending request.">
          <Card>
            <CardContent className="grid gap-2 p-4 md:grid-cols-6">
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={draft.flagId}
                onChange={(event) => setDraft({ ...draft, flagId: event.target.value })}
              >
                <option value="">Flag…</option>
                {flags.map((flag) => (
                  <option key={flag.id} value={flag.id}>
                    {flag.key}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={draft.environment}
                onChange={(event) => setDraft({ ...draft, environment: event.target.value as Environment })}
              >
                {ENVIRONMENTS.map((environment) => (
                  <option key={environment} value={environment}>
                    {environment}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={draft.enabled ? "on" : "off"}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.value === "on" })}
              >
                <option value="on">enable</option>
                <option value="off">disable</option>
              </select>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.rolloutPercent}
                onChange={(event) => setDraft({ ...draft, rolloutPercent: Number(event.target.value) })}
              />
              <Input placeholder="Ticket (CHG-…)" value={draft.ticket} onChange={(event) => setDraft({ ...draft, ticket: event.target.value })} />
              <Input placeholder="Justification" value={draft.justification} onChange={(event) => setDraft({ ...draft, justification: event.target.value })} />
              <Button
                className="md:col-span-2"
                disabled={!can("flag:propose") || !draft.flagId}
                onClick={() => void run(() => apiSend("/api/flags/change-requests", "POST", draft), "Change request submitted.")}
              >
                Submit change request
              </Button>
            </CardContent>
          </Card>
        </Section>

        <Section title="Change requests">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Flag</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-72">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.changeRequests ?? []).map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-mono text-xs">{request.id}</TableCell>
                      <TableCell className="text-xs">
                        {flags.find((flag) => flag.id === request.flagId)?.key ?? request.flagId}
                        <div className="text-[11px] text-muted-foreground">{request.environment}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {request.before.enabled ? "on" : "off"} {request.before.rolloutPercent}% → {request.after.enabled ? "on" : "off"} {request.after.rolloutPercent}%
                      </TableCell>
                      <TableCell className="text-xs">{request.ticket}</TableCell>
                      <TableCell>
                        <Badge variant={request.status === "pending" ? "outline" : request.status === "rejected" ? "destructive" : "secondary"}>{request.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {request.status === "pending" ? (
                          <div className="space-y-2">
                            <Input
                              placeholder="Review notes (mandatory)"
                              value={notes[request.id] ?? ""}
                              onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={!can("flag:approve")}
                                onClick={() => void run(() => apiSend(`/api/flags/change-requests/${request.id}`, "POST", { decision: "approve", notes: notes[request.id] }), "Change applied.")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!can("flag:approve")}
                                onClick={() => void run(() => apiSend(`/api/flags/change-requests/${request.id}`, "POST", { decision: "reject", notes: notes[request.id] }), "Change rejected.")}
                              >
                                Reject
                              </Button>
                            </div>
                            {request.proposedBy === user?.id ? <div className="text-[11px] text-amber-600">You proposed this change.</div> : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{request.reviewNotes ?? "—"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section>

        <Section title="Experiments">
          <div className="grid gap-3 md:grid-cols-2">
            {(data?.experiments ?? []).map((experiment) => (
              <Card key={experiment.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{experiment.name}</div>
                      <div className="text-xs text-muted-foreground">{experiment.hypothesis}</div>
                    </div>
                    <Badge variant={experiment.status === "running" ? "default" : "outline"}>{experiment.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {experiment.audience.segment} · {experiment.audience.percent}% · primary {experiment.primaryMetric} · guardrails {experiment.guardrailMetrics.join(", ")}
                  </div>
                  {experiment.requiresComplianceSignoff ? (
                    <div className="text-xs">
                      Compliance sign-off: {experiment.signedOffBy ? <span className="text-emerald-600">{experiment.signedOffBy}</span> : <span className="text-amber-600">required</span>}
                    </div>
                  ) : null}
                  <Input
                    placeholder="Notes"
                    value={notes[experiment.id] ?? ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [experiment.id]: event.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!can("experiment:approve")}
                      onClick={() => void run(() => apiSend(`/api/experiments/${experiment.id}`, "POST", { action: "sign_off", notes: notes[experiment.id] }), "Sign-off recorded.")}
                    >
                      Sign off
                    </Button>
                    <Button
                      size="sm"
                      disabled={!can("experiment:write") || experiment.status === "running"}
                      onClick={() => void run(() => apiSend(`/api/experiments/${experiment.id}`, "POST", { action: "start" }), "Experiment started.")}
                    >
                      Start
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!can("experiment:write") || experiment.status !== "running"}
                      onClick={() => void run(() => apiSend(`/api/experiments/${experiment.id}`, "POST", { action: "pause" }), "Experiment paused.")}
                    >
                      Pause
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!can("experiment:write")}
                      onClick={() => void run(() => apiSend(`/api/experiments/${experiment.id}`, "POST", { action: "conclude", notes: notes[experiment.id] }), "Experiment concluded.")}
                    >
                      Conclude
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
