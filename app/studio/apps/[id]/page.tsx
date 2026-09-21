"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Pencil, Play, ShieldCheck } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { ComponentRenderer } from "@/components/studio/component-renderer"
import { Designer, type DesignerDraft } from "@/components/studio/designer"
import type { ComponentDefinition, DataSystem, MakerApp, SolutionCheck } from "@/components/studio/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { apiSend, relative, useApi } from "@/lib/client/api"

interface AppPayload {
  app: MakerApp
  components: ComponentDefinition[]
  checks: SolutionCheck[]
}

export default function GeneratedAppPage() {
  const params = useParams<{ id: string }>()
  const appId = params.id
  const { data, loading, error, reload } = useApi<AppPayload>(`/api/studio/apps/${appId}`)
  const sources = useApi<{ systems: DataSystem[] }>("/api/datasources")
  const { can, user } = useSession()
  const [mode, setMode] = useState<"run" | "design">("run")
  const [screenId, setScreenId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success" | "error"; message: string } | null>(null)

  const app = data?.app
  const screen = app?.screens.find((candidate) => candidate.id === screenId) ?? app?.screens[0]
  const canEdit = Boolean(app && can("app:build") && (app.owner === user?.id || user?.roles.includes("admin")))

  const act = async (action: "publish" | "unpublish" | "check") => {
    setFeedback(null)
    try {
      await apiSend(`/api/studio/apps/${appId}`, "POST", { action })
      setFeedback({ kind: "success", message: action === "check" ? "Solution check complete — see results below." : `App ${action}ed and recorded on the audit chain.` })
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
      await reload()
    }
  }

  const save = async (draft: DesignerDraft) => {
    setSaving(true)
    setFeedback(null)
    try {
      const result = await apiSend<{ app: { status: string } }>(`/api/studio/apps/${appId}`, "PATCH", draft)
      setFeedback({
        kind: "success",
        message:
          app?.status === "published" && result.app.status === "draft"
            ? "Draft saved. The app is unpublished until the solution checker passes again and it is re-published."
            : "Draft saved. Changes are audited with before/after snapshots.",
      })
      await reload()
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading label="Opening app" />
  if (error || !app)
    return (
      <div className="space-y-3 p-6">
        <Link href="/studio" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <ArrowLeft className="size-3" /> Back to studio
        </Link>
        <Notice kind="denied">{error ?? "App not found."}</Notice>
      </div>
    )

  const errors = data?.checks.filter((check) => check.severity === "error") ?? []

  return (
    <div>
      <PageHeader
        title={app.name}
        description={`${app.description} · v${app.version} · ${app.environment} · owner ${app.owner}`}
        actions={
          <>
            <Badge variant={app.status === "published" ? "secondary" : "outline"}>{app.status}</Badge>
            {canEdit ? (
              <div className="flex rounded-lg border border-border p-0.5">
                <Button size="sm" variant={mode === "run" ? "default" : "ghost"} onClick={() => setMode("run")}>
                  <Play className="mr-1 size-3.5" /> Run
                </Button>
                <Button size="sm" variant={mode === "design" ? "default" : "ghost"} onClick={() => setMode("design")}>
                  <Pencil className="mr-1 size-3.5" /> Design
                </Button>
              </div>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => void act("check")}>
              <ShieldCheck className="mr-1 size-3.5" /> Solution check
            </Button>
            {app.status === "published" ? (
              <Button size="sm" variant="outline" disabled={!can("app:publish")} onClick={() => void act("unpublish")}>
                Unpublish
              </Button>
            ) : (
              <Button size="sm" disabled={!can("app:publish") || errors.length > 0} title={errors.length ? "Fix solution-checker errors first" : undefined} onClick={() => void act("publish")}>
                Publish
              </Button>
            )}
          </>
        }
      />

      {feedback ? (
        <div className="px-6 pt-4">
          <Notice kind={feedback.kind}>{feedback.message}</Notice>
        </div>
      ) : null}

      {(data?.checks ?? []).length > 0 ? (
        <div className="space-y-1.5 px-6 pt-4">
          {(data?.checks ?? []).map((check) => (
            <Notice key={check.id} kind={check.severity === "error" ? "error" : check.severity === "warning" ? "denied" : "info"}>
              <span className="font-mono text-[11px]">{check.id}</span> — {check.message}
            </Notice>
          ))}
        </div>
      ) : null}

      {mode === "design" && canEdit ? (
        <div className="mt-4 border-t border-border">
          <Designer key={`${app.id}:${app.version}:${app.updatedAt}`} app={app} components={data?.components ?? []} systems={sources.data?.systems ?? []} onSave={save} saving={saving} />
        </div>
      ) : (
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-2">
            {app.screens.map((candidate) => (
              <Button key={candidate.id} size="sm" variant={candidate.id === screen?.id ? "default" : "outline"} onClick={() => setScreenId(candidate.id)}>
                {candidate.name}
              </Button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              Rendered from metadata · every component re-authorizes its data for {user?.name ?? "you"} · updated {relative(app.updatedAt)}
            </span>
          </div>

          {screen?.components.length === 0 ? (
            <Notice kind="info">This screen has no components yet.{canEdit ? " Switch to Design to start building." : ""}</Notice>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {screen?.components.map((instance) => {
              const definition = data?.components.find((component) => component.id === instance.componentId)
              const wide = ["queue_table", "kpi_strip", "approval_panel", "filter_bar"].includes(instance.componentId)
              return (
                <Card key={instance.instanceId} className={wide ? "lg:col-span-2" : ""}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">{String(instance.props.title ?? definition?.name ?? instance.componentId)}</div>
                      <div className="flex flex-wrap gap-1">
                        {(definition?.governance ?? []).map((control) => (
                          <Badge key={control} variant="outline" className="text-[10px]">
                            {control}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <ComponentRenderer app={app} instance={instance} definition={definition} />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
