"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  BarChart3,
  CheckSquare,
  ClipboardList,
  Copy,
  Database,
  FileClock,
  FileUp,
  Filter,
  GripVertical,
  LayoutGrid,
  Lock,
  Plus,
  Redo2,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react"
import { Notice } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ComponentRenderer } from "./component-renderer"
import { DATA_RESOURCES, ROLE_IDS, type AppScreen, type ComponentDefinition, type ComponentInstance, type DataSystem, type MakerApp } from "./types"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  queue_table: Table2,
  kpi_strip: LayoutGrid,
  approval_panel: CheckSquare,
  document_uploader: FileUp,
  audit_trail: FileClock,
  record_form: ClipboardList,
  chart: BarChart3,
  filter_bar: Filter,
}

const MIME_COMPONENT = "application/x-northwind-component"
const MIME_INSTANCE = "application/x-northwind-instance"

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export interface DesignerDraft {
  name: string
  description: string
  environment: MakerApp["environment"]
  audienceRoles: string[]
  screens: AppScreen[]
}

export function Designer({
  app,
  components,
  systems,
  onSave,
  saving,
}: {
  app: MakerApp
  components: ComponentDefinition[]
  systems: DataSystem[]
  onSave: (draft: DesignerDraft) => Promise<void>
  saving: boolean
}) {
  const { can } = useSession()
  const initial = useMemo<DesignerDraft>(
    () => ({ name: app.name, description: app.description, environment: app.environment, audienceRoles: app.audienceRoles, screens: app.screens }),
    [app],
  )
  const [history, setHistory] = useState<{ past: DesignerDraft[]; present: DesignerDraft; future: DesignerDraft[] }>({ past: [], present: initial, future: [] })
  const draft = history.present
  const [screenId, setScreenId] = useState(app.screens[0]?.id ?? "")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [panel, setPanel] = useState<"component" | "app">("component")

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const screen = draft.screens.find((candidate) => candidate.id === screenId) ?? draft.screens[0]
  const selected = screen?.components.find((component) => component.instanceId === selectedId) ?? null
  const definitionFor = useCallback((componentId: string) => components.find((component) => component.id === componentId), [components])

  const commit = useCallback((update: (current: DesignerDraft) => DesignerDraft) => {
    setHistory((current) => ({ past: [...current.past.slice(-30), current.present], present: update(current.present), future: [] }))
  }, [])
  const undo = () =>
    setHistory((current) => (current.past.length ? { past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future] } : current))
  const redo = () =>
    setHistory((current) => (current.future.length ? { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) } : current))

  const updateScreen = (update: (current: AppScreen) => AppScreen) =>
    commit((current) => ({ ...current, screens: current.screens.map((candidate) => (candidate.id === screen?.id ? update(candidate) : candidate)) }))

  const insertComponent = (componentId: string, index: number) => {
    const definition = definitionFor(componentId)
    const instance: ComponentInstance = {
      instanceId: newId("cmp"),
      componentId,
      props: { title: definition?.name ?? componentId, ...(definition?.props.some((prop) => prop.key === "resource") ? { resource: app.resource } : {}) },
    }
    updateScreen((current) => {
      const next = [...current.components]
      next.splice(index, 0, instance)
      return { ...current, components: next }
    })
    setSelectedId(instance.instanceId)
    setPanel("component")
  }

  const moveComponent = (instanceId: string, index: number) =>
    updateScreen((current) => {
      const from = current.components.findIndex((component) => component.instanceId === instanceId)
      if (from < 0) return current
      const next = [...current.components]
      const [item] = next.splice(from, 1)
      next.splice(from < index ? index - 1 : index, 0, item)
      return { ...current, components: next }
    })

  const removeComponent = (instanceId: string) => {
    updateScreen((current) => ({ ...current, components: current.components.filter((component) => component.instanceId !== instanceId) }))
    if (selectedId === instanceId) setSelectedId(null)
  }

  const duplicateComponent = (instanceId: string) =>
    updateScreen((current) => {
      const index = current.components.findIndex((component) => component.instanceId === instanceId)
      const source = current.components[index]
      const copy = { ...source, instanceId: newId("cmp"), props: { ...source.props } }
      const next = [...current.components]
      next.splice(index + 1, 0, copy)
      return { ...current, components: next }
    })

  const setProp = (key: string, value: unknown) =>
    updateScreen((current) => ({
      ...current,
      components: current.components.map((component) =>
        component.instanceId === selectedId ? { ...component, props: { ...component.props, [key]: value } } : component,
      ),
    }))

  const addScreen = () => {
    const id = newId("scr")
    commit((current) => ({ ...current, screens: [...current.screens, { id, name: `Screen ${current.screens.length + 1}`, components: [] }] }))
    setScreenId(id)
  }

  const onDrop = (event: React.DragEvent, index: number) => {
    event.preventDefault()
    const componentId = event.dataTransfer.getData(MIME_COMPONENT)
    const instanceId = event.dataTransfer.getData(MIME_INSTANCE)
    if (componentId) insertComponent(componentId, index)
    else if (instanceId) moveComponent(instanceId, index)
    setDropIndex(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      if ((event.metaKey || event.ctrlKey) && event.key === "z") {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if ((event.key === "Backspace" || event.key === "Delete") && selectedId) {
        event.preventDefault()
        removeComponent(selectedId)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, screen?.id])

  const environmentAllows = (systemId: string) =>
    systems.find((system) => system.id === systemId)?.environments.find((entry) => entry.environment === draft.environment)?.allowed ?? true

  const grouped = useMemo(() => {
    const map = new Map<string, ComponentDefinition[]>()
    for (const component of components) map.set(component.category, [...(map.get(component.category) ?? []), component])
    return [...map.entries()]
  }, [components])

  const previewApp: MakerApp = { ...app, ...draft }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-4 py-2">
        <div className="flex gap-1">
          {draft.screens.map((candidate) => (
            <button
              key={candidate.id}
              onClick={() => setScreenId(candidate.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${candidate.id === screen?.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {candidate.name}
              <span className="ml-1 text-[10px] opacity-70">{candidate.components.length}</span>
            </button>
          ))}
          <button onClick={addScreen} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" title="Add screen">
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={undo} disabled={!history.past.length} title="Undo (⌘Z)">
            <Undo2 className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={redo} disabled={!history.future.length} title="Redo (⇧⌘Z)">
            <Redo2 className="size-4" />
          </Button>
          <Button size="sm" variant={panel === "app" ? "default" : "outline"} onClick={() => setPanel(panel === "app" ? "component" : "app")}>
            App settings
          </Button>
          <Button size="sm" disabled={!dirty || saving || !can("app:build")} onClick={() => void onSave(draft)}>
            {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="space-y-4 overflow-y-auto border-r border-border bg-card/40 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Components</div>
          {grouped.map(([category, items]) => (
            <div key={category} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{category}</div>
              {items.map((component) => {
                const Icon = ICONS[component.id] ?? LayoutGrid
                const allowed = can(component.requiredPermission)
                return (
                  <div
                    key={component.id}
                    draggable={allowed}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(MIME_COMPONENT, component.id)
                      event.dataTransfer.effectAllowed = "copy"
                    }}
                    onDoubleClick={() => allowed && insertComponent(component.id, screen?.components.length ?? 0)}
                    title={allowed ? `${component.description}\n\nDrag onto the canvas or double-click to append.` : `Requires ${component.requiredPermission}`}
                    className={`group flex cursor-grab items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs shadow-sm transition active:cursor-grabbing ${allowed ? "hover:border-primary/50 hover:shadow" : "opacity-50"}`}
                  >
                    <Icon className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{component.name}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{component.governance[0]}</div>
                    </div>
                    {allowed ? <Plus className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" onClick={() => insertComponent(component.id, screen?.components.length ?? 0)} /> : <Lock className="size-3.5 shrink-0" />}
                  </div>
                )
              })}
            </div>
          ))}
          <div className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
            Every component carries its own permission gate and audit hooks — the canvas cannot widen access.
          </div>
        </aside>

        <main
          className="overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] bg-[length:16px_16px] p-6"
          onClick={() => setSelectedId(null)}
        >
          <div className="mx-auto max-w-4xl space-y-1 rounded-xl border border-border bg-background p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{draft.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {screen?.name} · {draft.environment} · audience {draft.audienceRoles.join(", ") || "none"}
                </div>
              </div>
              <Badge variant="outline" className="text-[10px]">
                Live preview with your permissions
              </Badge>
            </div>

            <DropZone index={0} active={dropIndex === 0} onEnter={() => setDropIndex(0)} onDrop={onDrop} empty={screen?.components.length === 0} />
            {screen?.components.map((instance, index) => {
              const definition = definitionFor(instance.componentId)
              const Icon = ICONS[instance.componentId] ?? LayoutGrid
              const isSelected = instance.instanceId === selectedId
              const binding = typeof instance.props.binding === "string" ? instance.props.binding : ""
              const blocked = binding ? !environmentAllows(binding.split(".")[0]) : false
              return (
                <div key={instance.instanceId}>
                  <div
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(MIME_INSTANCE, instance.instanceId)
                      event.dataTransfer.effectAllowed = "move"
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedId(instance.instanceId)
                      setPanel("component")
                    }}
                    className={`group relative rounded-lg border bg-card p-3 transition ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"} ${blocked ? "border-destructive/60" : ""}`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <GripVertical className="size-4 cursor-grab text-muted-foreground/60" />
                      <Icon className="size-3.5 text-primary" />
                      <span className="text-xs font-medium">{String(instance.props.title ?? definition?.name ?? instance.componentId)}</span>
                      {binding ? (
                        <Badge variant="outline" className="text-[10px]">
                          <Database className="mr-1 size-3" /> {binding}
                        </Badge>
                      ) : typeof instance.props.resource === "string" ? (
                        <Badge variant="outline" className="text-[10px]">
                          {instance.props.resource}
                        </Badge>
                      ) : null}
                      {blocked ? <Badge className="bg-destructive/15 text-[10px] text-destructive hover:bg-destructive/15">DLP blocked in {draft.environment}</Badge> : null}
                      <div className="ml-auto flex gap-1 opacity-0 transition group-hover:opacity-100">
                        <button className="rounded p-1 hover:bg-muted" title="Duplicate" onClick={(event) => (event.stopPropagation(), duplicateComponent(instance.instanceId))}>
                          <Copy className="size-3.5" />
                        </button>
                        <button className="rounded p-1 text-destructive hover:bg-destructive/10" title="Remove" onClick={(event) => (event.stopPropagation(), removeComponent(instance.instanceId))}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="pointer-events-none">
                      <ComponentRenderer app={previewApp} instance={instance} definition={definition} compact />
                    </div>
                  </div>
                  <DropZone index={index + 1} active={dropIndex === index + 1} onEnter={() => setDropIndex(index + 1)} onDrop={onDrop} />
                </div>
              )
            })}
          </div>
        </main>

        <aside className="overflow-y-auto border-l border-border bg-card/40 p-3">
          {panel === "app" ? (
            <AppSettings draft={draft} systems={systems} onChange={(update) => commit((current) => ({ ...current, ...update }))} />
          ) : selected ? (
            <PropertyPanel
              instance={selected}
              definition={definitionFor(selected.componentId)}
              systems={systems}
              environment={draft.environment}
              onChange={setProp}
              onRemove={() => removeComponent(selected.instanceId)}
            />
          ) : (
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="text-[11px] font-semibold uppercase tracking-wide">Properties</div>
              <p>Select a component on the canvas to edit its title, data binding and columns.</p>
              <p>Drag from the palette to add; drag the grip to reorder; ⌫ removes the selection; ⌘Z undoes.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function DropZone({
  index,
  active,
  empty,
  onEnter,
  onDrop,
}: {
  index: number
  active: boolean
  empty?: boolean
  onEnter: () => void
  onDrop: (event: React.DragEvent, index: number) => void
}) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        onEnter()
      }}
      onDrop={(event) => onDrop(event, index)}
      className={`transition-all ${
        empty
          ? `flex h-40 items-center justify-center rounded-lg border-2 border-dashed text-xs ${active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`
          : `my-1 rounded-full ${active ? "h-2 bg-primary" : "h-2 bg-transparent"}`
      }`}
    >
      {empty ? "Drag a component here to start building" : null}
    </div>
  )
}

function PropertyPanel({
  instance,
  definition,
  systems,
  environment,
  onChange,
  onRemove,
}: {
  instance: ComponentInstance
  definition?: ComponentDefinition
  systems: DataSystem[]
  environment: string
  onChange: (key: string, value: unknown) => void
  onRemove: () => void
}) {
  const binding = typeof instance.props.binding === "string" ? instance.props.binding : ""
  const boundEntity = binding ? systems.find((system) => system.id === binding.split(".")[0])?.entities.find((entity) => entity.id === binding.split(".")[1]) : null
  const columnOptions = boundEntity?.fields.map((field) => field.name) ?? []
  const chosen = Array.isArray(instance.props.columns) ? (instance.props.columns as string[]) : []

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{definition?.name ?? instance.componentId}</div>
        <div className="text-[11px] text-muted-foreground">{definition?.description}</div>
      </div>

      {definition?.props.map((prop) => {
        if (prop.type === "text" || prop.type === "number")
          return (
            <Field key={prop.key} label={prop.label}>
              <Input
                type={prop.type}
                className="h-8 text-xs"
                value={String(instance.props[prop.key] ?? "")}
                onChange={(event) => onChange(prop.key, prop.type === "number" ? Number(event.target.value) || undefined : event.target.value)}
              />
            </Field>
          )
        if (prop.type === "resource")
          return (
            <Field key={prop.key} label={prop.label} hint="Governed in-app resource; re-authorized per request.">
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={String(instance.props.resource ?? "")}
                onChange={(event) => {
                  onChange("resource", event.target.value)
                  onChange("binding", undefined)
                }}
              >
                {DATA_RESOURCES.map((resource) => (
                  <option key={resource} value={resource}>
                    {resource}
                  </option>
                ))}
              </select>
            </Field>
          )
        if (prop.type === "binding")
          return (
            <Field key={prop.key} label={prop.label} hint="Overrides the in-app resource with an external system entity.">
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={binding}
                onChange={(event) => {
                  onChange("binding", event.target.value || undefined)
                  onChange("columns", undefined)
                }}
              >
                <option value="">— none —</option>
                {systems.map((system) => {
                  const allowed = system.environments.find((entry) => entry.environment === environment)?.allowed ?? true
                  return (
                    <optgroup key={system.id} label={`${system.name}${allowed ? "" : " (DLP blocked)"}`}>
                      {system.entities.map((entity) => (
                        <option key={entity.id} value={`${system.id}.${entity.id}`} disabled={!entity.bindable}>
                          {entity.name} · {entity.classification}
                          {entity.piiFields.length ? " · PII" : ""}
                          {entity.bindable ? "" : ` (needs ${entity.requiredPermission})`}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
              {boundEntity ? (
                <div className="mt-2 space-y-1 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
                  <div>{boundEntity.description}</div>
                  <div>
                    <Badge variant="outline" className="text-[10px]">
                      {boundEntity.classification}
                    </Badge>{" "}
                    {boundEntity.piiFields.length ? `PII: ${boundEntity.piiFields.join(", ")} (masked unless cleared)` : "No PII fields"}
                  </div>
                </div>
              ) : null}
            </Field>
          )
        if (prop.type === "columns")
          return (
            <Field key={prop.key} label={prop.label} hint={columnOptions.length ? "Untick to hide a field from this table." : "Bind an external entity to pick columns; in-app resources use their governed projection."}>
              <div className="flex flex-wrap gap-1">
                {columnOptions.map((column) => {
                  const on = chosen.length === 0 || chosen.includes(column)
                  const pii = boundEntity?.piiFields.includes(column)
                  return (
                    <button
                      key={column}
                      onClick={() => {
                        const base = chosen.length ? chosen : columnOptions
                        const next = on ? base.filter((entry) => entry !== column) : [...base, column]
                        onChange("columns", next.length === columnOptions.length ? undefined : next)
                      }}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition ${on ? "border-primary/50 bg-primary/10" : "border-border text-muted-foreground line-through"}`}
                    >
                      {column}
                      {pii ? " ·PII" : ""}
                    </button>
                  )
                })}
              </div>
            </Field>
          )
        return null
      })}

      <div className="space-y-1 rounded-md border border-border p-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Enforced controls</div>
        {(definition?.governance ?? []).map((control) => (
          <div key={control} className="text-[11px] text-muted-foreground">
            · {control}
          </div>
        ))}
        <div className="font-mono text-[10px] text-muted-foreground">requires {definition?.requiredPermission}</div>
      </div>

      <Button size="sm" variant="outline" className="w-full text-destructive" onClick={onRemove}>
        <Trash2 className="mr-1 size-3.5" /> Remove component
      </Button>
    </div>
  )
}

function AppSettings({ draft, systems, onChange }: { draft: DesignerDraft; systems: DataSystem[]; onChange: (update: Partial<DesignerDraft>) => void }) {
  const boundSystems = new Set(draft.screens.flatMap((screen) => screen.components.map((component) => (typeof component.props.binding === "string" ? component.props.binding.split(".")[0] : null))).filter(Boolean))
  const blocked = [...boundSystems].filter((systemId) => !(systems.find((system) => system.id === systemId)?.environments.find((entry) => entry.environment === draft.environment)?.allowed ?? true))
  return (
    <div className="space-y-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">App settings</div>
      <Field label="Name">
        <Input className="h-8 text-xs" value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
      </Field>
      <Field label="Description">
        <Input className="h-8 text-xs" value={draft.description} onChange={(event) => onChange({ description: event.target.value })} />
      </Field>
      <Field label="Environment" hint="Publishing to production requires an independent approver.">
        <select
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          value={draft.environment}
          onChange={(event) => onChange({ environment: event.target.value as DesignerDraft["environment"] })}
        >
          <option value="development">development</option>
          <option value="staging">staging</option>
          <option value="production">production</option>
        </select>
        {blocked.length ? <Notice kind="error">DLP blocks {blocked.join(", ")} in {draft.environment}; the solution checker will fail publish.</Notice> : null}
      </Field>
      <Field label="Audience roles" hint="Who can open the published app. Data access is still evaluated per row.">
        <div className="flex flex-wrap gap-1">
          {ROLE_IDS.map((role) => {
            const on = draft.audienceRoles.includes(role)
            return (
              <button
                key={role}
                onClick={() => onChange({ audienceRoles: on ? draft.audienceRoles.filter((entry) => entry !== role) : [...draft.audienceRoles, role] })}
                className={`rounded-md border px-2 py-0.5 text-[11px] transition ${on ? "border-primary/50 bg-primary/10" : "border-border text-muted-foreground"}`}
              >
                {role}
              </button>
            )
          })}
        </div>
      </Field>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-[10px] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}
