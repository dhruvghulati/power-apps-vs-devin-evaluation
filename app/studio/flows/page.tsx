"use client"

import { useState } from "react"
import { ArrowDown, Bell, CheckSquare, GitBranch, GripVertical, Play, Plus, Trash2, Zap } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Loading, Notice, Section, StatCard } from "@/components/data-ui"
import { useSession } from "@/components/session-provider"
import { ROLE_IDS } from "@/components/studio/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiSend, relative, useApi } from "@/lib/client/api"

type FlowStep =
  | { id: string; kind: "condition"; field: string; operator: "gt" | "lt" | "eq" | "contains"; value: string }
  | { id: string; kind: "approval"; approverRole: string; slaHours: number }
  | { id: string; kind: "action"; action: "notify" | "create_task" | "kill_flag" | "escalate_case" | "post_stream"; target: string; message: string }

interface Flow {
  id: string
  name: string
  description: string
  owner: string
  environment: "development" | "staging" | "production"
  trigger: string
  steps: FlowStep[]
  status: "draft" | "active" | "paused"
  connectors: string[]
  createdAt: string
  runCount: number
  lastRunAt?: string
}

interface FlowRun {
  id: string
  flowId: string
  triggeredBy: string
  triggerEventId: string
  startedAt: string
  status: "completed" | "stopped" | "awaiting_approval" | "failed"
  steps: { stepId: string; kind: FlowStep["kind"]; outcome: string; detail: string }[]
}

interface FlowTask {
  id: string
  flowRunId: string
  title: string
  approverRole: string
  dueAt: string
  status: "open" | "approved" | "rejected"
  decidedBy?: string
}

interface FlowsPayload {
  flows: Flow[]
  runs: FlowRun[]
  tasks: FlowTask[]
  triggers: { id: string; label: string; description: string }[]
  connectors: { id: string; name: string; topic: string }[]
}

const ACTIONS = [
  { id: "notify", label: "Notify team", targetLabel: "Channel or team" },
  { id: "create_task", label: "Create task", targetLabel: "Queue" },
  { id: "kill_flag", label: "Kill feature flag", targetLabel: "Flag key" },
  { id: "escalate_case", label: "Escalate KYC case", targetLabel: 'Case id or "auto"' },
  { id: "post_stream", label: "Publish to connector", targetLabel: "Connector id" },
] as const

const SAMPLE_FIELDS = ["amountMinor", "currency", "entity", "priority", "status", "riskRating", "sanctions", "topic"]
const MIME_STEP = "application/x-northwind-step"
const MIME_STEP_INSTANCE = "application/x-northwind-step-instance"

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

function blankStep(kind: FlowStep["kind"]): FlowStep {
  if (kind === "condition") return { id: newId("stp"), kind, field: "amountMinor", operator: "gt", value: "100000" }
  if (kind === "approval") return { id: newId("stp"), kind, approverRole: "manager", slaHours: 4 }
  return { id: newId("stp"), kind, action: "notify", target: "#ops-refunds", message: "Flow triggered" }
}

function describe(step: FlowStep): string {
  if (step.kind === "condition") return `${step.field} ${step.operator} ${step.value}`
  if (step.kind === "approval") return `${step.approverRole} · ${step.slaHours}h SLA`
  return `${ACTIONS.find((action) => action.id === step.action)?.label ?? step.action} → ${step.target}`
}

type FlowDraft = Pick<Flow, "name" | "description" | "trigger" | "steps" | "environment">

const STEP_META = {
  condition: { icon: GitBranch, tone: "border-sky-500/40 bg-sky-500/5", label: "Condition" },
  approval: { icon: CheckSquare, tone: "border-amber-500/40 bg-amber-500/5", label: "Approval" },
  action: { icon: Bell, tone: "border-emerald-500/40 bg-emerald-500/5", label: "Action" },
} as const

export default function FlowBuilderPage() {
  const { data, loading, error, reload } = useApi<FlowsPayload>("/api/studio/flows")
  const { can, user } = useSession()
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [edits, setEdits] = useState<{ key: string; draft: FlowDraft } | null>(null)
  const [stepId, setStepId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ kind: "denied" | "success" | "error" | "info"; message: string } | null>(null)
  const [lastRun, setLastRun] = useState<FlowRun | null>(null)
  const [sample, setSample] = useState('{"amountMinor": 250000, "currency": "EUR", "entity": "EU", "priority": "high"}')
  const [taskNotes, setTaskNotes] = useState<Record<string, string>>({})

  const flows = data?.flows ?? []
  const selectedId = chosenId ?? flows[0]?.id ?? null
  const selected = flows.find((flow) => flow.id === selectedId) ?? null
  const isNew = selectedId === "new"

  const baseDraft: FlowDraft | null = selected
    ? { name: selected.name, description: selected.description, trigger: selected.trigger, steps: selected.steps, environment: selected.environment }
    : null
  const draftKey = isNew ? "new" : selected ? `${selected.id}:${selected.status}:${selected.runCount}:${JSON.stringify(selected.steps)}` : null
  const draft = edits && edits.key === draftKey ? edits.draft : baseDraft

  const select = (id: string) => {
    setChosenId(id)
    setEdits(
      id === "new"
        ? { key: "new", draft: { name: "New flow", description: "", trigger: data?.triggers[0]?.id ?? "refund.created", steps: [blankStep("condition")], environment: "development" } }
        : null,
    )
    setStepId(null)
    setLastRun(null)
  }
  const setDraft = (next: FlowDraft) => {
    if (draftKey) setEdits({ key: draftKey, draft: next })
  }

  const canEdit = isNew || Boolean(selected && can("flow:build") && (selected.owner === user?.id || user?.roles.includes("admin")))
  const dirty = Boolean(draft) && (isNew || JSON.stringify(draft) !== JSON.stringify(baseDraft))

  const updateSteps = (update: (steps: FlowStep[]) => FlowStep[]) => {
    if (draft) setDraft({ ...draft, steps: update(draft.steps) })
  }

  const insertStep = (kind: FlowStep["kind"], index: number) => {
    const step = blankStep(kind)
    updateSteps((steps) => [...steps.slice(0, index), step, ...steps.slice(index)])
    setStepId(step.id)
  }
  const moveStep = (id: string, index: number) =>
    updateSteps((steps) => {
      const from = steps.findIndex((step) => step.id === id)
      if (from < 0) return steps
      const next = [...steps]
      const [item] = next.splice(from, 1)
      next.splice(from < index ? index - 1 : index, 0, item)
      return next
    })
  const removeStep = (id: string) => {
    updateSteps((steps) => steps.filter((step) => step.id !== id))
    if (stepId === id) setStepId(null)
  }
  const patchStep = (id: string, patch: Partial<FlowStep>) =>
    updateSteps((steps) => steps.map((step) => (step.id === id ? ({ ...step, ...patch } as FlowStep) : step)))

  const onDrop = (event: React.DragEvent, index: number) => {
    event.preventDefault()
    const kind = event.dataTransfer.getData(MIME_STEP) as FlowStep["kind"] | ""
    const id = event.dataTransfer.getData(MIME_STEP_INSTANCE)
    if (kind) insertStep(kind, index)
    else if (id) moveStep(id, index)
    setDropIndex(null)
  }

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

  const save = () =>
    draft &&
    run(async () => {
      if (isNew) {
        const created = await apiSend<{ flow: Flow }>("/api/studio/flows", "POST", draft)
        select(created.flow.id)
      } else if (selected) await apiSend(`/api/studio/flows/${selected.id}`, "PATCH", draft)
    }, isNew ? "Flow created as a draft." : "Flow saved; an active flow returns to draft until re-activated.")

  const test = () =>
    selected &&
    run(async () => {
      const parsed = JSON.parse(sample) as Record<string, unknown>
      const result = await apiSend<{ run: FlowRun }>(`/api/studio/flows/${selected.id}`, "POST", { action: "test", sample: parsed })
      setLastRun(result.run)
    }, "Test run executed against the saved definition.")

  const selectedStep = draft?.steps.find((step) => step.id === stepId) ?? null
  const openTasks = (data?.tasks ?? []).filter((task) => task.status === "open")
  const runsForFlow = (data?.runs ?? []).filter((candidate) => candidate.flowId === selected?.id)

  return (
    <div>
      <PageHeader
        title="Flow builder"
        description="Automations that react to domain events. Approval steps are real maker-checker tasks gated by role; kill-switch actions and production activation require an independent administrator."
        actions={
          <Button size="sm" disabled={!can("flow:build")} onClick={() => select("new")}>
            <Plus className="mr-1 size-3.5" /> New flow
          </Button>
        }
      />

      <div className="space-y-4 p-6">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {feedback ? <Notice kind={feedback.kind}>{feedback.message}</Notice> : null}
        {loading ? <Loading /> : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Flows" value={flows.length} hint={`${flows.filter((flow) => flow.status === "active").length} active`} />
          <StatCard label="Runs (recent)" value={data?.runs.length ?? 0} />
          <StatCard label="Awaiting approval" value={openTasks.length} />
          <StatCard label="Your approvals" value={openTasks.filter((task) => user?.roles.includes(task.approverRole)).length} hint="Tasks your roles can decide" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Flows</div>
            {flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => select(flow.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${flow.id === selectedId ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{flow.name}</span>
                  <Badge variant={flow.status === "active" ? "secondary" : "outline"} className="text-[10px]">
                    {flow.status}
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {flow.trigger} · {flow.steps.length} steps · {flow.runCount} runs
                </div>
              </button>
            ))}

            <div className="pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Steps</div>
            {(["condition", "approval", "action"] as const).map((kind) => {
              const meta = STEP_META[kind]
              return (
                <div
                  key={kind}
                  draggable={canEdit}
                  onDragStart={(event) => event.dataTransfer.setData(MIME_STEP, kind)}
                  onDoubleClick={() => canEdit && insertStep(kind, draft?.steps.length ?? 0)}
                  className={`flex cursor-grab items-center gap-2 rounded-lg border px-2.5 py-2 text-xs shadow-sm active:cursor-grabbing ${meta.tone} ${canEdit ? "" : "opacity-50"}`}
                  title="Drag onto the flow or double-click to append"
                >
                  <meta.icon className="size-4" />
                  <div>
                    <div className="font-medium">{meta.label}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {kind === "condition" ? "Stop unless the event matches" : kind === "approval" ? "Human maker-checker gate" : "Notify, escalate, kill, publish"}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-4">
            {draft ? (
              <Card>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="h-8 w-64 text-sm font-medium" value={draft.name} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={draft.environment}
                      disabled={!canEdit || !isNew}
                      onChange={(event) => setDraft({ ...draft, environment: event.target.value as Flow["environment"] })}
                    >
                      <option value="development">development</option>
                      <option value="staging">staging</option>
                      <option value="production">production</option>
                    </select>
                    <div className="ml-auto flex gap-2">
                      {selected && !isNew ? (
                        <>
                          <Button size="sm" variant="outline" disabled={!can("flow:build")} onClick={() => void test()}>
                            <Play className="mr-1 size-3.5" /> Test
                          </Button>
                          {selected.status === "active" ? (
                            <Button size="sm" variant="outline" disabled={!can("flow:publish")} onClick={() => void run(() => apiSend(`/api/studio/flows/${selected.id}`, "POST", { action: "pause" }), "Flow paused.")}>
                              Pause
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled={!can("flow:publish") || dirty} title={dirty ? "Save first" : undefined} onClick={() => void run(() => apiSend(`/api/studio/flows/${selected.id}`, "POST", { action: "activate" }), "Flow activated and subscribed to its trigger.")}>
                              <Zap className="mr-1 size-3.5" /> Activate
                            </Button>
                          )}
                        </>
                      ) : null}
                      <Button size="sm" disabled={!canEdit || !dirty} onClick={() => void save()}>
                        {isNew ? "Create flow" : dirty ? "Save" : "Saved"}
                      </Button>
                    </div>
                  </div>
                  <Input className="h-8 text-xs" placeholder="Description" value={draft.description} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />

                  <div className="mx-auto max-w-xl space-y-1" onClick={() => setStepId(null)}>
                    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <Zap className="size-4 text-primary" /> Trigger
                      </div>
                      <select
                        className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={draft.trigger}
                        disabled={!canEdit}
                        onChange={(event) => setDraft({ ...draft, trigger: event.target.value })}
                      >
                        {(data?.triggers ?? []).map((trigger) => (
                          <option key={trigger.id} value={trigger.id}>
                            {trigger.label} — {trigger.description}
                          </option>
                        ))}
                      </select>
                    </div>

                    <StepDropZone index={0} active={dropIndex === 0} onEnter={() => setDropIndex(0)} onDrop={onDrop} />
                    {draft.steps.map((step, index) => {
                      const meta = STEP_META[step.kind]
                      const outcome = lastRun?.steps.find((entry) => entry.stepId === step.id)
                      return (
                        <div key={step.id}>
                          <div
                            draggable={canEdit}
                            onDragStart={(event) => event.dataTransfer.setData(MIME_STEP_INSTANCE, step.id)}
                            onClick={(event) => {
                              event.stopPropagation()
                              setStepId(step.id)
                            }}
                            className={`group flex items-center gap-2 rounded-lg border p-3 transition ${meta.tone} ${step.id === stepId ? "ring-2 ring-primary/40" : ""}`}
                          >
                            <GripVertical className="size-4 cursor-grab text-muted-foreground/60" />
                            <meta.icon className="size-4" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium">
                                {meta.label} <span className="text-muted-foreground">#{index + 1}</span>
                              </div>
                              <div className="truncate text-[11px] text-muted-foreground">{describe(step)}</div>
                            </div>
                            {outcome ? (
                              <Badge variant="outline" className={`text-[10px] ${outcome.outcome === "stopped" ? "text-amber-600" : outcome.outcome === "executed" || outcome.outcome === "passed" ? "text-emerald-600" : ""}`} title={outcome.detail}>
                                {outcome.outcome.replace("_", " ")}
                              </Badge>
                            ) : null}
                            {canEdit ? (
                              <button className="rounded p-1 text-destructive opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10" onClick={(event) => (event.stopPropagation(), removeStep(step.id))}>
                                <Trash2 className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <StepDropZone index={index + 1} active={dropIndex === index + 1} onEnter={() => setDropIndex(index + 1)} onDrop={onDrop} last={index === draft.steps.length - 1} />
                        </div>
                      )
                    })}
                    {draft.steps.length === 0 ? <div className="rounded-lg border-2 border-dashed border-border p-6 text-center text-xs text-muted-foreground">Drag a step here</div> : null}
                  </div>

                  {selected && !isNew ? (
                    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Test with a sample event</div>
                      <textarea className="h-16 w-full rounded-md border border-input bg-background p-2 font-mono text-[11px]" value={sample} onChange={(event) => setSample(event.target.value)} />
                      {lastRun ? (
                        <div className="text-[11px]">
                          Run <span className="font-mono">{lastRun.id}</span> → <Badge variant="outline">{lastRun.status.replace("_", " ")}</Badge>
                          <ul className="mt-1 space-y-0.5 text-muted-foreground">
                            {lastRun.steps.map((entry) => (
                              <li key={entry.stepId}>
                                · {entry.kind}: {entry.detail}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {selected ? (
              <Section title="Run history" description="Each run records per-step outcomes; approval steps open tasks below.">
                {runsForFlow.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No runs yet.</div>
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border text-xs">
                    {runsForFlow.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="font-mono text-[11px]">{entry.id}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {entry.status.replace("_", " ")}
                        </Badge>
                        <span className="text-muted-foreground">by {entry.triggeredBy}</span>
                        <span className="ml-auto text-muted-foreground">{relative(entry.startedAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            ) : null}
          </div>

          <div className="space-y-4">
            {selectedStep && draft ? (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{STEP_META[selectedStep.kind].label} step</div>
                  {selectedStep.kind === "condition" ? (
                    <>
                      <Field label="Field">
                        <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={selectedStep.field} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { field: event.target.value })}>
                          {[...new Set([selectedStep.field, ...SAMPLE_FIELDS])].map((field) => (
                            <option key={field}>{field}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Operator">
                        <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={selectedStep.operator} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { operator: event.target.value as "gt" | "lt" | "eq" | "contains" })}>
                          <option value="gt">greater than</option>
                          <option value="lt">less than</option>
                          <option value="eq">equals</option>
                          <option value="contains">contains</option>
                        </select>
                      </Field>
                      <Field label="Value">
                        <Input className="h-8 text-xs" value={selectedStep.value} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { value: event.target.value })} />
                      </Field>
                    </>
                  ) : selectedStep.kind === "approval" ? (
                    <>
                      <Field label="Approver role" hint="The triggering user can never approve their own run.">
                        <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={selectedStep.approverRole} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { approverRole: event.target.value })}>
                          {ROLE_IDS.map((role) => (
                            <option key={role}>{role}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="SLA (hours)">
                        <Input type="number" className="h-8 text-xs" value={selectedStep.slaHours} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { slaHours: Number(event.target.value) })} />
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field label="Action" hint={selectedStep.action === "kill_flag" ? "Kill-switch flows can only be activated by an administrator." : undefined}>
                        <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={selectedStep.action} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { action: event.target.value as (typeof ACTIONS)[number]["id"] })}>
                          {ACTIONS.map((action) => (
                            <option key={action.id} value={action.id}>
                              {action.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={ACTIONS.find((action) => action.id === selectedStep.action)?.targetLabel ?? "Target"}>
                        {selectedStep.action === "post_stream" ? (
                          <select className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs" value={selectedStep.target} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { target: event.target.value })}>
                            <option value="">— choose connector —</option>
                            {(data?.connectors ?? []).map((connector) => (
                              <option key={connector.id} value={connector.id}>
                                {connector.name} ({connector.topic})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input className="h-8 text-xs" value={selectedStep.target} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { target: event.target.value })} />
                        )}
                      </Field>
                      <Field label="Message">
                        <Input className="h-8 text-xs" value={selectedStep.message} disabled={!canEdit} onChange={(event) => patchStep(selectedStep.id, { message: event.target.value })} />
                      </Field>
                    </>
                  )}
                  {canEdit ? (
                    <Button size="sm" variant="outline" className="w-full text-destructive" onClick={() => removeStep(selectedStep.id)}>
                      <Trash2 className="mr-1 size-3.5" /> Remove step
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                Select a step to edit it. Drag steps from the palette into the flow; drag the grip to reorder.
              </div>
            )}

            <Section title="Approval inbox" description="Open maker-checker tasks from flow runs.">
              {openTasks.length === 0 ? <div className="text-xs text-muted-foreground">Nothing awaiting approval.</div> : null}
              <div className="space-y-2">
                {openTasks.map((task) => {
                  const eligible = user?.roles.includes(task.approverRole)
                  return (
                    <Card key={task.id}>
                      <CardContent className="space-y-2 p-3">
                        <div className="text-xs font-medium">{task.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          needs <span className="font-mono">{task.approverRole}</span> · due {relative(task.dueAt)}
                        </div>
                        <Input className="h-7 text-xs" placeholder="Decision notes (required)" value={taskNotes[task.id] ?? ""} onChange={(event) => setTaskNotes({ ...taskNotes, [task.id]: event.target.value })} />
                        <div className="flex gap-1">
                          <Button size="sm" className="h-7 flex-1 text-xs" disabled={!eligible} onClick={() => void run(() => apiSend(`/api/studio/tasks/${task.id}`, "POST", { decision: "approved", notes: taskNotes[task.id] ?? "" }), "Task approved.")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={!eligible} onClick={() => void run(() => apiSend(`/api/studio/tasks/${task.id}`, "POST", { decision: "rejected", notes: taskNotes[task.id] ?? "" }), "Task rejected.")}>
                            Reject
                          </Button>
                        </div>
                        {!eligible ? <div className="text-[10px] text-muted-foreground">Your roles cannot decide this task (server-enforced).</div> : null}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepDropZone({ index, active, last, onEnter, onDrop }: { index: number; active: boolean; last?: boolean; onEnter: () => void; onDrop: (event: React.DragEvent, index: number) => void }) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        onEnter()
      }}
      onDrop={(event) => onDrop(event, index)}
      className={`flex h-6 items-center justify-center transition ${active ? "text-primary" : "text-muted-foreground/50"}`}
    >
      {active ? <div className="h-1.5 w-full rounded-full bg-primary" /> : last ? <div className="text-[10px]">end</div> : <ArrowDown className="size-3.5" />}
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
