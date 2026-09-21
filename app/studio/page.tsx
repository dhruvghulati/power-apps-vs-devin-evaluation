"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiSend, relative, useApi } from "@/lib/client/api"

interface Template {
  id: string
  name: string
  description: string
  category: string
  resource: string
  defaultRoles: string[]
  connectors: string[]
  screens: { id: string; name: string; components: { componentId: string }[] }[]
}

interface ComponentDefinition {
  id: string
  name: string
  description: string
  category: string
  requiredPermission: string
  governance: string[]
}

interface MakerApp {
  id: string
  name: string
  description: string
  owner: string
  environment: string
  status: string
  resource: string
  audienceRoles: string[]
  connectors: string[]
  version: number
  updatedAt: string
  sessions30d: number
  screens: { id: string; name: string; components: unknown[] }[]
}

interface StudioPayload {
  apps: MakerApp[]
  templates: Template[]
  components: ComponentDefinition[]
  connectors: { id: string; name: string; kind: string; topic: string; status: string }[]
}

export default function StudioPage() {
  const { data, loading, error, reload } = useApi<StudioPayload>("/api/studio/apps")
  const { can } = useSession()
  const router = useRouter()
  const [name, setName] = useState("")
  const [environment, setEnvironment] = useState("development")
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success"; message: string } | null>(null)

  const create = async (templateId: string) => {
    setFeedback(null)
    try {
      const result = await apiSend<{ app: MakerApp }>("/api/studio/apps", "POST", { templateId, name: name || undefined, environment })
      await reload()
      router.push(`/studio/apps/${result.app.id}`)
    } catch (caught) {
      setFeedback({ kind: "denied", message: caught instanceof Error ? caught.message : "Request failed" })
    }
  }

  return (
    <div>
      <PageHeader
        title="App studio"
        description="Compose internal apps from governed components and templates. The generated app is metadata — it renders through a runtime that re-authorizes every row against the same policy engine the hand-built pages use."
        actions={<Badge variant="outline">{data?.apps.length ?? 0} apps visible to you</Badge>}
      />

      <div className="space-y-6 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}
        {loading ? <Loading /> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Apps" value={data?.apps.length ?? 0} />
          <StatCard label="Published" value={(data?.apps ?? []).filter((app) => app.status === "published").length} />
          <StatCard label="Templates" value={data?.templates.length ?? 0} />
          <StatCard label="Governed components" value={data?.components.length ?? 0} />
        </div>

        <Section title="Your apps">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(data?.apps ?? []).map((app) => (
              <Card key={app.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link href={`/studio/apps/${app.id}`} className="text-sm font-medium hover:underline">
                        {app.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{app.description}</div>
                    </div>
                    <Badge variant={app.status === "published" ? "secondary" : "outline"}>{app.status}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    v{app.version} · {app.environment} · {app.screens.length} screens · {app.sessions30d} sessions/30d · updated {relative(app.updatedAt)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {app.audienceRoles.map((role) => (
                      <Badge key={role} variant="outline" className="text-[10px]">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          title="Start from a template"
          description="Templates ship with screens, components, connector bindings and a default audience; the solution checker runs before anything can be published."
          actions={
            <div className="flex gap-2">
              <Input className="w-56" placeholder="App name (optional)" value={name} onChange={(event) => setName(event.target.value)} />
              <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm" value={environment} onChange={(event) => setEnvironment(event.target.value)}>
                <option value="development">development</option>
                <option value="staging">staging</option>
                <option value="production">production</option>
              </select>
            </div>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(data?.templates ?? []).map((template) => (
              <Card key={template.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium">{template.name}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {template.category}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{template.description}</div>
                  <div className="text-[11px] text-muted-foreground">
                    data source {template.resource} · {template.screens.length} screens ·{" "}
                    {template.screens.reduce((sum, screen) => sum + screen.components.length, 0)} components
                  </div>
                  <Button size="sm" disabled={!can("app:build")} onClick={() => void create(template.id)}>
                    Create app
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {!can("app:build") ? <Notice kind="info">Your roles can open apps but not build them.</Notice> : null}
        </Section>

        <Section title="Component library" description="Every component carries the controls it enforces wherever a maker drops it — governance is a property of the component, not of the maker's discipline.">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {(data?.components ?? []).map((component) => (
              <Card key={component.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium">{component.name}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {component.category}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{component.description}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">requires {component.requiredPermission}</div>
                  <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                    {component.governance.map((control) => (
                      <li key={control}>· {control}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
