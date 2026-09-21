"use client"

import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useApi } from "@/lib/client/api"

interface Control {
  id: string
  framework: string[]
  name: string
  description: string
  status: "pass" | "attention" | "fail"
  evidence: string
  automated: boolean
}

interface CompliancePayload {
  controls: Control[]
  score: number
  byFramework: Record<string, { score: number; controls: number }>
  chain: { valid: boolean; totalEvents: number; latestHash: string; verifiedAt: string; brokenAtSeq?: number }
  sodMatrix: { roles: string[]; reason: string }[]
  accessReviews: { id: string; userId: string; reviewer: string; decision: string; at: string; notes: string }[]
  retention: { framework: string; requirement: string; applies: string }[]
}

const STATUS_VARIANT = { pass: "secondary", attention: "outline", fail: "destructive" } as const

export default function CompliancePage() {
  const { data, loading, error } = useApi<CompliancePayload>("/api/compliance")
  const controls = data?.controls ?? []

  return (
    <div>
      <PageHeader
        title="Compliance controls"
        description="Each control is evaluated against live system state on every request — the evidence column is computed, not attested in a spreadsheet."
        actions={
          <Badge variant={data?.chain.valid ? "secondary" : "destructive"}>
            Audit chain {data?.chain.valid ? "verified" : `broken at seq ${data?.chain.brokenAtSeq}`}
          </Badge>
        }
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {loading ? <Loading /> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Control score" value={`${data?.score ?? 0}%`} hint={`${controls.length} controls`} />
          <StatCard label="Failing" value={controls.filter((control) => control.status === "fail").length} />
          <StatCard label="Needs attention" value={controls.filter((control) => control.status === "attention").length} />
          <StatCard label="Automated" value={controls.filter((control) => control.automated).length} hint="Evidence gathered without humans" />
        </div>

        <Section title="Frameworks">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(data?.byFramework ?? {}).map(([framework, value]) => (
              <Card key={framework}>
                <CardContent className="px-3 py-2">
                  <div className="text-xs font-medium">{framework}</div>
                  <div className="text-lg font-semibold tabular-nums">{value.score}%</div>
                  <div className="text-[11px] text-muted-foreground">{value.controls} controls</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Control register">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Control</TableHead>
                    <TableHead>Frameworks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Live evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controls.map((control) => (
                    <TableRow key={control.id}>
                      <TableCell>
                        <div className="font-mono text-[11px] text-muted-foreground">{control.id}</div>
                        <div className="text-sm">{control.name}</div>
                        <div className="text-xs text-muted-foreground">{control.description}</div>
                      </TableCell>
                      <TableCell className="space-x-1">
                        {control.framework.map((framework) => (
                          <Badge key={framework} variant="outline" className="text-[10px]">
                            {framework}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[control.status]}>{control.status}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md text-xs text-muted-foreground">{control.evidence}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Segregation of duties" description="These pairs are refused at provisioning time, so a conflicting grant never exists to be detected later.">
            <Card>
              <CardContent className="space-y-2 p-4 text-xs">
                {(data?.sodMatrix ?? []).map((conflict) => (
                  <div key={conflict.roles.join("-")} className="rounded-md border border-border p-2">
                    <div className="font-medium">{conflict.roles.join("  ✕  ")}</div>
                    <div className="text-muted-foreground">{conflict.reason}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Section>

          <Section title="Retention">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Framework</TableHead>
                      <TableHead>Requirement</TableHead>
                      <TableHead>Applies to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.retention ?? []).map((rule) => (
                      <TableRow key={rule.framework}>
                        <TableCell className="text-xs">{rule.framework}</TableCell>
                        <TableCell className="text-xs">{rule.requirement}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{rule.applies}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Section>
        </div>

        <Section title="Access reviews">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Decision</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.accessReviews ?? []).map((review) => (
                    <TableRow key={review.id}>
                      <TableCell className="text-xs">{review.userId}</TableCell>
                      <TableCell className="text-xs">{review.reviewer}</TableCell>
                      <TableCell className="text-xs">{review.decision}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{review.notes}</TableCell>
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
