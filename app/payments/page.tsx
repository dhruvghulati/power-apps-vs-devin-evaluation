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

interface Payment {
  id: string
  refundId: string
  amountMinor: number
  currency: string
  status: string
  pspReference?: string
  failureCode?: string
  initiatedBy: string
  approvedBy: string[]
  idempotencyKey: string
  settledAt?: string
  reconciledAt?: string
  screening: { sanctions: string; velocity: string; at: string }
  instrument: { brand: string; last4: string; token: string }
}

interface LedgerEntry {
  id: string
  paymentId: string
  account: string
  direction: string
  amountMinor: number
  currency: string
  memo: string
}

interface PaymentsPayload {
  payments: Payment[]
  ledger: LedgerEntry[]
  reconciliation: { balanced: boolean; unreconciled: number; failed: number; awaitingApproval: number }
}

export default function PaymentsPage() {
  const { data, loading, error, reload } = useApi<PaymentsPayload>("/api/payments")
  const refunds = useApi<{ refunds: { id: string; status: string; amountMinor: number; currency: string; customerName: string }[] }>("/api/refunds")
  const { can, user } = useSession()
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success"; message: string } | null>(null)
  const [refundId, setRefundId] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState("")

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setFeedback(null)
    try {
      await fn()
      setFeedback({ kind: "success", message: success })
      await reload()
      await refunds.reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  const approvedRefunds = (refunds.data?.refunds ?? []).filter((refund) => refund.status === "approved")
  const payments = data?.payments ?? []

  return (
    <div>
      <PageHeader
        title="Payout control"
        description="Tokenised instruments, idempotent initiation, an independent release approval, sanctions re-screening immediately before PSP submission, and balanced double-entry postings."
        actions={
          <Badge variant={data?.reconciliation.balanced ? "secondary" : "destructive"}>
            Ledger {data?.reconciliation.balanced ? "balanced" : "out of balance"}
          </Badge>
        }
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Awaiting release" value={data?.reconciliation.awaitingApproval ?? 0} hint="Second pair of eyes" />
          <StatCard label="Unreconciled" value={data?.reconciliation.unreconciled ?? 0} hint="Settled, not matched to PSP" />
          <StatCard label="Failed" value={data?.reconciliation.failed ?? 0} />
          <StatCard label="Ledger entries" value={data?.ledger.length ?? 0} hint="Debits equal credits" />
        </div>

        <Section title="Initiate payout" description="An idempotency key is mandatory: replaying the same key returns the original payout instead of paying twice.">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-2 p-4">
              <div className="min-w-56 flex-1">
                <label className="text-xs text-muted-foreground">Approved refund</label>
                <select
                  className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  value={refundId}
                  onChange={(event) => setRefundId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {approvedRefunds.map((refund) => (
                    <option key={refund.id} value={refund.id}>
                      {refund.id} · {money(refund.amountMinor, refund.currency)} · {refund.customerName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-56 flex-1">
                <label className="text-xs text-muted-foreground">Idempotency key</label>
                <Input className="mt-1" value={idempotencyKey} placeholder="e.g. payout-2026-09-21-001" onChange={(event) => setIdempotencyKey(event.target.value)} />
              </div>
              <Button
                disabled={!can("payment:initiate") || !refundId || !idempotencyKey}
                onClick={() => void run(() => apiSend("/api/payments", "POST", { refundId, idempotencyKey }), "Payout initiated; it now needs an independent release approval.")}
              >
                Initiate
              </Button>
              {!can("payment:initiate") ? <span className="text-xs text-muted-foreground">Your roles cannot initiate payouts.</span> : null}
            </CardContent>
          </Card>
        </Section>

        <Section title="Payouts">
          {loading ? (
            <Loading />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payout</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Screening</TableHead>
                      <TableHead>Instrument</TableHead>
                      <TableHead>PSP</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          <div className="font-mono text-xs">{payment.id}</div>
                          <div className="text-[11px] text-muted-foreground">from {payment.refundId}</div>
                        </TableCell>
                        <TableCell className="tabular-nums">{money(payment.amountMinor, payment.currency)}</TableCell>
                        <TableCell>
                          <Badge variant={payment.status === "settled" ? "secondary" : payment.status === "failed" ? "destructive" : "outline"}>
                            {payment.status.replace("_", " ")}
                          </Badge>
                          {payment.settledAt ? <div className="text-[11px] text-muted-foreground">{relative(payment.settledAt)}</div> : null}
                        </TableCell>
                        <TableCell className="text-xs">
                          sanctions {payment.screening.sanctions} · velocity {payment.screening.velocity}
                        </TableCell>
                        <TableCell className="text-xs uppercase">
                          {payment.instrument.brand} ····{payment.instrument.last4}
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{payment.pspReference ?? payment.failureCode ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!can("payment:approve") || payment.status !== "requires_approval" || payment.initiatedBy === user?.id}
                              onClick={() => void run(() => apiSend(`/api/payments/${payment.id}`, "POST", { action: "approve" }), "Release approved.")}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              disabled={!can("payment:execute") || payment.status !== "authorized"}
                              onClick={() => void run(() => apiSend(`/api/payments/${payment.id}`, "POST", { action: "execute" }), "Submitted to PSP after re-screening.")}
                            >
                              Execute
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!can("payment:execute") || payment.status !== "settled" || Boolean(payment.reconciledAt)}
                              onClick={() => void run(() => apiSend(`/api/payments/${payment.id}`, "POST", { action: "reconcile" }), "Reconciled against the PSP statement.")}
                            >
                              Reconcile
                            </Button>
                          </div>
                          {payment.initiatedBy === user?.id ? (
                            <div className="mt-1 text-[11px] text-amber-600">You initiated this payout.</div>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </Section>

        <Section title="Ledger" description="Every payout posts balanced debit and credit entries; unbalanced postings are rejected by the ledger, not by a report.">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Memo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.ledger ?? []).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.id}</TableCell>
                      <TableCell className="font-mono text-xs">{entry.paymentId}</TableCell>
                      <TableCell className="text-xs">{entry.account.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-xs">{entry.direction}</TableCell>
                      <TableCell className="tabular-nums">{money(entry.amountMinor, entry.currency)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.memo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section>
      </div>
    </div>
  )
}
