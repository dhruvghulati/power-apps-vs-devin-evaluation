"use client"

import { useState } from "react"
import { FileLock2, ShieldCheck, Upload } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiSend, relative, useApi } from "@/lib/client/api"

interface KycDocument {
  id: string
  kind: string
  filename: string
  status: string
  sha256: string
  residency: string
  retentionUntil: string
  legalHold: boolean
  downloadCount: number
  encryption: { algorithm: string; keyId: string }
}

interface KycCase {
  id: string
  customerName: string
  customerEmail: string
  dateOfBirth: string
  country: string
  riskRating: string
  status: string
  slaDueAt: string
  slaBreached: boolean
  assignedTo?: string
  reviewedBy?: string
  decidedBy?: string
  entity: string
  piiMasked: boolean
  sanctionsScreening: { result: string; provider: string }
  pepScreening: { result: string }
  documents: KycDocument[]
}

export default function KycPage() {
  const { data, loading, error, reload } = useApi<{ cases: KycCase[]; hiddenByScope: number }>("/api/kyc")
  const { can, user } = useSession()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [reason, setReason] = useState("")
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success"; message: string } | null>(null)

  const cases = data?.cases ?? []
  const selected = cases.find((kycCase) => kycCase.id === selectedId) ?? cases[0] ?? null

  const act = async (action: string) => {
    if (!selected) return
    setFeedback(null)
    try {
      await apiSend(`/api/kyc/${selected.id}`, "POST", { action, notes })
      setNotes("")
      setFeedback({ kind: "success", message: `${action} recorded for ${selected.id}.` })
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  const documentAction = async (documentId: string, action: string) => {
    setFeedback(null)
    try {
      const result = await apiSend<{ url?: string }>(`/api/documents/${documentId}`, "POST", { action, reason })
      if (result.url) {
        setFeedback({ kind: "success", message: "Single-use download grant issued (5 minutes, bound to your identity)." })
        window.open(result.url, "_blank")
      } else {
        setFeedback({ kind: "success", message: `${action} applied to ${documentId}.` })
      }
      setReason("")
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  const upload = async (file: File) => {
    if (!selected) return
    const form = new FormData()
    form.append("file", file)
    form.append("kind", "proof_of_address")
    setFeedback(null)
    try {
      const response = await fetch(`/api/kyc/${selected.id}/documents`, { method: "POST", body: form })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Upload failed")
      setFeedback({ kind: "success", message: "Document encrypted (AES-256-GCM) and checksummed before storage." })
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Upload failed" })
    }
  }

  return (
    <div>
      <PageHeader
        title="KYC review"
        description="Four-eyes CDD: the reviewer who recommends a case can never approve it, documents are encrypted at rest, and every download is a single-use, identity-bound grant."
        actions={<Badge variant="outline">{cases.length} cases in scope</Badge>}
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="In review" value={cases.filter((c) => c.status === "in_review").length} />
          <StatCard label="Escalated" value={cases.filter((c) => c.status === "escalated").length} hint="MLRO queue" />
          <StatCard label="Past SLA" value={cases.filter((c) => c.slaBreached).length} hint="Risk-based turnaround" />
          <StatCard label="PII" value={cases[0]?.piiMasked ? "Masked" : "Visible"} hint="Financial crime roles only" />
        </div>

        {loading ? (
          <Loading />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Section title="Case queue">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Case</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>SLA</TableHead>
                        <TableHead>Screening</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cases.map((kycCase) => (
                        <TableRow
                          key={kycCase.id}
                          onClick={() => setSelectedId(kycCase.id)}
                          className={`cursor-pointer ${selected?.id === kycCase.id ? "bg-muted/60" : ""}`}
                        >
                          <TableCell className="font-mono text-xs">{kycCase.id}</TableCell>
                          <TableCell>
                            <div className="text-sm">{kycCase.customerName}</div>
                            <div className="text-xs text-muted-foreground">{kycCase.country}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={kycCase.riskRating === "high" ? "destructive" : "secondary"}>{kycCase.riskRating}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{kycCase.status.replace("_", " ")}</TableCell>
                          <TableCell className={`text-xs ${kycCase.slaBreached ? "text-destructive" : "text-muted-foreground"}`}>
                            {relative(kycCase.slaDueAt)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {kycCase.sanctionsScreening.result === "clear" ? "clear" : `sanctions: ${kycCase.sanctionsScreening.result}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </Section>

            <Section title={selected ? `Case ${selected.id}` : "No case selected"} description="Actions are authorized server-side for your roles.">
              {selected ? (
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Customer</div>
                        <div>{selected.customerName}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Date of birth</div>
                        <div>{selected.dateOfBirth}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Reviewed by</div>
                        <div>{selected.reviewedBy ?? "—"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Decided by</div>
                        <div>{selected.decidedBy ?? "—"}</div>
                      </div>
                    </div>

                    <Input placeholder="Rationale / CDD summary" value={notes} onChange={(event) => setNotes(event.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void act("claim")} disabled={!can("kyc:write")}>
                        Claim
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void act("recommend")} disabled={!can("kyc:write")}>
                        Recommend
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void act("escalate")} disabled={!can("kyc:escalate")}>
                        Escalate
                      </Button>
                      <Button size="sm" onClick={() => void act("approve")} disabled={!can("kyc:decide")}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void act("reject")} disabled={!can("kyc:decide")}>
                        Reject
                      </Button>
                    </div>
                    {selected.reviewedBy === user?.id && can("kyc:decide") ? (
                      <Notice kind="denied">You reviewed this file — four-eyes will block your decision.</Notice>
                    ) : null}

                    <div className="space-y-2 border-t border-border pt-3">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <FileLock2 className="size-3.5" /> Evidence ({selected.documents.length})
                      </div>
                      {selected.documents.map((document) => (
                        <div key={document.id} className="rounded-md border border-border p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{document.filename}</span>
                            <Badge variant={document.status === "verified" ? "secondary" : "outline"}>{document.status}</Badge>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {document.encryption.algorithm} · key {document.encryption.keyId} · residency {document.residency} · retained until{" "}
                            {new Date(document.retentionUntil).getFullYear()}
                            {document.legalHold ? " · legal hold" : ""}
                          </div>
                          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">sha256 {document.sha256}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => void documentAction(document.id, "grant_download")} disabled={!can("kyc:document_download")}>
                              Download
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void documentAction(document.id, "verify")} disabled={!can("kyc:document_upload")}>
                              Verify
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => void documentAction(document.id, "legal_hold")} disabled={!can("privacy:erase")}>
                              Legal hold
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Input placeholder="Business reason for document access" value={reason} onChange={(event) => setReason(event.target.value)} />
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                        <Upload className="size-3.5" />
                        Upload evidence (PDF/PNG/JPEG, ≤8 MB)
                        <input
                          type="file"
                          className="hidden"
                          disabled={!can("kyc:document_upload")}
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            if (file) void upload(file)
                          }}
                        />
                      </label>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <ShieldCheck className="size-3" /> Ciphertext and keys never reach the browser.
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}
