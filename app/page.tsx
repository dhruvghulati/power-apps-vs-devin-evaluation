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
import { apiSend, money, relative, useApi } from "@/lib/client/api"

interface Refund {
  id: string
  customerName: string
  customerEmail: string
  amountMinor: number
  currency: string
  reason: string
  status: string
  priority: string
  entity: string
  requestedBy: string
  requestedAt: string
  requiredApprovals: number
  approvalsOutstanding: number
  awaitingRoles: string[]
  approvals: { actorEmail: string; decision: string; notes: string; at: string }[]
  piiMasked: boolean
  regEDeadline: string
  instrument: { brand: string; last4: string; country: string }
}

interface RefundsPayload {
  refunds: Refund[]
  scope: string
  hiddenByScope: number
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
  paid: "default",
  payment_failed: "destructive",
}

export default function RefundsPage() {
  const { data, loading, error, reload } = useApi<RefundsPayload>("/api/refunds")
  const { can, user } = useSession()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success" | "error"; message: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const decide = async (refund: Refund, decision: "approved" | "rejected") => {
    setBusy(refund.id)
    setFeedback(null)
    try {
      await apiSend(`/api/refunds/${refund.id}/decision`, "POST", { decision, notes: notes[refund.id] ?? "" })
      setNotes((current) => ({ ...current, [refund.id]: "" }))
      setFeedback({ kind: "success", message: `${refund.id} ${decision}. Decision written to the audit chain.` })
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    } finally {
      setBusy(null)
    }
  }

  const refunds = data?.refunds ?? []
  const pending = refunds.filter((refund) => refund.status === "pending")
  const exposure = refunds.filter((r) => r.status !== "rejected").reduce((sum, r) => sum + r.amountMinor, 0)

  return (
    <div>
      <PageHeader
        title="Refund operations"
        description="Threshold-based approvals with maker-checker separation. Every decision is authorized server-side and appended to the audit chain — the buttons below are not what protects the data."
        actions={
          <Badge variant="outline">
            Entity scope: {data?.scope ?? "—"}
            {data && data.hiddenByScope > 0 ? ` · ${data.hiddenByScope} records hidden` : ""}
          </Badge>
        }
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind === "success" ? "success" : "denied"}>{feedback.message}</Notice> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Awaiting decision" value={pending.length} hint="Approvals scale with amount" />
          <StatCard label="Open exposure" value={money(exposure, "USD")} hint="Approx., mixed currency" />
          <StatCard label="Visible records" value={refunds.length} hint={`Scope ${data?.scope ?? "—"}`} />
          <StatCard label="PII" value={refunds[0]?.piiMasked ? "Masked" : "Visible"} hint="Projection depends on your permissions" />
        </div>

        <Section
          title="Refund queue"
          description="Under $100 auto-approves · $100–$1,000 one approval · $1,000–$5,000 two · above $5,000 three, including a director."
        >
          {loading ? (
            <Loading />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Refund</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approvals</TableHead>
                      <TableHead>Reg E</TableHead>
                      <TableHead className="w-[320px]">Decision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {refunds.map((refund) => {
                      const isInitiator = refund.requestedBy === user?.id
                      const alreadyDecided = refund.approvals.some((a) => a.actorEmail === user?.email)
                      const canDecide = can("refund:approve") && ["pending", "approved"].includes(refund.status)
                      return (
                        <TableRow key={refund.id}>
                          <TableCell className="font-mono text-xs">{refund.id}</TableCell>
                          <TableCell>
                            <div className="text-sm">{refund.customerName}</div>
                            <div className="text-xs text-muted-foreground">{refund.customerEmail}</div>
                          </TableCell>
                          <TableCell className="tabular-nums">{money(refund.amountMinor, refund.currency)}</TableCell>
                          <TableCell className="text-xs uppercase text-muted-foreground">
                            {refund.instrument.brand} ····{refund.instrument.last4}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[refund.status] ?? "outline"}>{refund.status.replace("_", " ")}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {refund.approvals.filter((a) => a.decision === "approved").length}/{refund.requiredApprovals}
                            {refund.status === "pending" && refund.awaitingRoles.length > 0 ? (
                              <div className="text-muted-foreground">Awaiting {refund.awaitingRoles.join(", ")}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{relative(refund.regEDeadline)}</TableCell>
                          <TableCell>
                            {canDecide ? (
                              <div className="space-y-2">
                                <Input
                                  placeholder="Decision rationale (mandatory)"
                                  value={notes[refund.id] ?? ""}
                                  onChange={(event) => setNotes((current) => ({ ...current, [refund.id]: event.target.value }))}
                                />
                                <div className="flex gap-2">
                                  <Button size="sm" disabled={busy === refund.id || !(notes[refund.id] ?? "").trim()} onClick={() => void decide(refund, "approved")}>
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="outline" disabled={busy === refund.id || !(notes[refund.id] ?? "").trim()} onClick={() => void decide(refund, "rejected")}>
                                    Reject
                                  </Button>
                                </div>
                                {isInitiator ? (
                                  <div className="text-xs text-amber-600">You raised this refund — maker-checker will block you.</div>
                                ) : null}
                                {alreadyDecided ? <div className="text-xs text-amber-600">You have already decided this refund.</div> : null}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {can("refund:approve") ? "No decision available" : "Your roles do not include refund approval"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </Section>
      </div>
    </div>
  )
}
