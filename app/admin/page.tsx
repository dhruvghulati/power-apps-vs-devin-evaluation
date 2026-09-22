"use client"

import { useState } from "react"
import Link from "next/link"
import { Blocks, ShieldCheck, Users } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { ROLE_IDS } from "@/components/studio/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiSend, relative, useApi } from "@/lib/client/api"

interface PlatformPayload {
  environments: { id: string; label: string; region: string; dataClass: string; apps: number; flows: number; dlpPolicy: { name: string; businessConnectors: string[]; nonBusinessConnectors: string[]; blockedConnectors: string[] } | null }[]
  inventory: { id: string; name: string; owner: string; environment: string; status: string; version: number; audienceRoles: string[]; connectors: string[]; sessions30d: number; updatedAt: string; issues: number }[]
  flows: { id: string; name: string; owner: string; trigger: string; status: string; environment: string; runCount: number; lastRunAt?: string }[]
  analytics: { apps: number; publishedApps: number; flows: number; activeFlows: number; makers: number; sessions30d: number; flowRuns: number; openTasks: number }
  posture: { score: number; failing: number; chain: { valid: boolean; totalEvents: number } }
}

interface UsersPayload {
  users: { id: string; name: string; email: string; roles: string[]; scope: string; mfaEnrolled: boolean; lastAccessReviewAt?: string; permissions: string[] }[]
  roles: { id: string; name: string; description: string; permissions: string[] }[]
  accessReviews: { id: string; period: string; reviewer: string; startedAt: string; completedAt?: string; decisions: { userId: string; decision: string; note: string }[] }[]
}

export default function AdminCentrePage() {
  const platform = useApi<PlatformPayload>("/api/platform")
  const directory = useApi<UsersPayload>("/api/admin/users")
  const { can } = useSession()
  const [grant, setGrant] = useState({ userId: "", role: "manager", operation: "grant" as "grant" | "revoke", justification: "" })
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success"; message: string } | null>(null)

  const submitGrant = async () => {
    setFeedback(null)
    try {
      await apiSend("/api/admin/users", "POST", grant)
      setFeedback({ kind: "success", message: `Role ${grant.role} ${grant.operation === "grant" ? "granted to" : "revoked from"} ${grant.userId}; the change is on the audit chain with its justification.` })
      setGrant({ ...grant, justification: "" })
      await directory.reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  const analytics = platform.data?.analytics

  return (
    <div>
      <PageHeader
        title="Admin centre"
        description="Environments, DLP boundaries, maker inventory, identities and entitlements — the control plane for everything makers build."
        actions={
          platform.data ? (
            <Badge variant="outline" className={platform.data.posture.chain.valid ? "text-emerald-600" : "text-red-600"}>
              <ShieldCheck className="mr-1 size-3" /> audit chain {platform.data.posture.chain.valid ? "verified" : "BROKEN"} · {platform.data.posture.chain.totalEvents} events
            </Badge>
          ) : null
        }
      />

      <div className="space-y-6 p-6">
        {platform.error ? <Notice kind="denied">{platform.error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}
        {platform.loading ? <Loading /> : null}

        {analytics ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Apps" value={analytics.apps} hint={`${analytics.publishedApps} published · ${analytics.sessions30d} sessions/30d`} />
            <StatCard label="Flows" value={analytics.flows} hint={`${analytics.activeFlows} active · ${analytics.flowRuns} runs · ${analytics.openTasks} open tasks`} />
            <StatCard label="Makers" value={analytics.makers} hint="Distinct app/flow owners" />
            <StatCard label="Control posture" value={`${platform.data?.posture.score ?? 0}%`} hint={`${platform.data?.posture.failing ?? 0} failing controls`} />
          </div>
        ) : null}

        <Section title="Environments & DLP" description="Connectors are classified business / non-business per environment and cannot be mixed in one app; blocked connectors fail the solution checker.">
          <div className="grid gap-3 lg:grid-cols-3">
            {(platform.data?.environments ?? []).map((environment) => (
              <Card key={environment.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{environment.label}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {environment.id}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {environment.region} · {environment.dataClass} · {environment.apps} apps · {environment.flows} flows
                  </div>
                  {environment.dlpPolicy ? (
                    <div className="space-y-1 rounded-md bg-muted/40 p-2 text-[11px]">
                      <div className="font-medium">{environment.dlpPolicy.name}</div>
                      <div className="text-muted-foreground">business: {environment.dlpPolicy.businessConnectors.join(", ") || "—"}</div>
                      <div className="text-muted-foreground">non-business: {environment.dlpPolicy.nonBusinessConnectors.join(", ") || "—"}</div>
                      <div className={environment.dlpPolicy.blockedConnectors.length ? "text-red-600" : "text-muted-foreground"}>blocked: {environment.dlpPolicy.blockedConnectors.join(", ") || "none"}</div>
                    </div>
                  ) : (
                    <Notice kind="denied">No DLP policy — inherits nothing. Define one before publishing here.</Notice>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="App inventory" description="Every maker app, its audience and solution-checker issues.">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>App</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Env</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(platform.data?.inventory ?? []).map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="text-xs">
                        <Link href={`/studio/apps/${app.id}`} className="font-medium hover:underline">
                          {app.name}
                        </Link>
                        <div className="text-[10px] text-muted-foreground">v{app.version} · {relative(app.updatedAt)}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{app.owner}</TableCell>
                      <TableCell className="text-xs">{app.environment}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={app.status === "published" ? "secondary" : "outline"} className="text-[10px]">
                          {app.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{app.audienceRoles.join(", ")}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{app.sessions30d}</TableCell>
                      <TableCell className={`text-right text-xs tabular-nums ${app.issues ? "text-amber-600" : ""}`}>{app.issues}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section title="Flow inventory" description="Automations across environments.">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Flow</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Env</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(platform.data?.flows ?? []).map((flow) => (
                    <TableRow key={flow.id}>
                      <TableCell className="text-xs font-medium">
                        <Link href="/studio/flows" className="hover:underline">
                          {flow.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{flow.owner}</TableCell>
                      <TableCell className="font-mono text-[10px]">{flow.trigger}</TableCell>
                      <TableCell className="text-xs">{flow.environment}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={flow.status === "active" ? "secondary" : "outline"} className="text-[10px]">
                          {flow.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {flow.runCount}
                        <div className="text-[10px] text-muted-foreground">{relative(flow.lastRunAt)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>

        <Section
          title="Identities & entitlements"
          description="Role grants run through the preventive segregation-of-duties matrix; a conflicting grant is blocked and audited, not just flagged."
          actions={
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users className="size-3.5" /> {directory.data?.users.length ?? 0} identities · {directory.data?.roles.length ?? 0} roles
            </div>
          }
        >
          {directory.error ? <Notice kind="denied">{directory.error}</Notice> : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identity</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>MFA</TableHead>
                    <TableHead>Last review</TableHead>
                    <TableHead className="text-right">Permissions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(directory.data?.users ?? []).map((user) => (
                    <TableRow key={user.id} className={grant.userId === user.id ? "bg-primary/5" : ""} onClick={() => setGrant({ ...grant, userId: user.id })}>
                      <TableCell className="text-xs">
                        <div className="font-medium">{user.name}</div>
                        <div className="text-[10px] text-muted-foreground">{user.email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role} variant="outline" className="text-[10px]">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{user.scope}</TableCell>
                      <TableCell className={`text-xs ${user.mfaEnrolled ? "text-emerald-600" : "text-amber-600"}`}>{user.mfaEnrolled ? "enrolled" : "missing"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{relative(user.lastAccessReviewAt)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{user.permissions.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Blocks className="size-3.5" /> Change entitlement
                </div>
                <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={grant.userId} onChange={(event) => setGrant({ ...grant, userId: event.target.value })}>
                  <option value="">— choose identity —</option>
                  {(directory.data?.users ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.roles.join(", ")})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={grant.operation} onChange={(event) => setGrant({ ...grant, operation: event.target.value as "grant" | "revoke" })}>
                    <option value="grant">grant</option>
                    <option value="revoke">revoke</option>
                  </select>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={grant.role} onChange={(event) => setGrant({ ...grant, role: event.target.value })}>
                    {ROLE_IDS.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <Input className="h-8 text-xs" placeholder="Justification (required, audited)" value={grant.justification} onChange={(event) => setGrant({ ...grant, justification: event.target.value })} />
                <Button size="sm" className="w-full" disabled={!can("admin:roles") || !grant.userId} onClick={() => void submitGrant()}>
                  Apply
                </Button>
                <div className="text-[10px] text-muted-foreground">
                  Try granting <span className="font-mono">payments_operator</span> to a manager, or <span className="font-mono">kyc_approver</span> to a KYC reviewer — SoD blocks it.
                </div>
                <div className="space-y-1 border-t border-border pt-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Access reviews</div>
                  {(directory.data?.accessReviews ?? []).map((review) => (
                    <div key={review.id} className="text-[11px]">
                      <span className="font-medium">{review.period}</span> · {review.reviewer} · {review.completedAt ? `completed ${relative(review.completedAt)}` : "in progress"} · {review.decisions.length} decisions
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  )
}
