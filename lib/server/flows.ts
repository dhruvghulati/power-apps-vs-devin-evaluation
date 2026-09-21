import { appendAudit, subscribe } from './audit'
import { randomId } from './crypto'
import { db, timestamp } from './store'
import type { Flow, FlowRun, FlowRunStep, FlowStep, TriggerType } from './studio-types'
import type { AuditEvent, StreamEvent } from './types'

/**
 * Flow runtime. Flows are declarative (trigger -> condition -> approval ->
 * action) and run server-side off the same audit stream every mutation writes
 * to, so an automation can never bypass a control it was built on top of.
 */

const HOUR = 60 * 60 * 1000

function readField(context: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key]
    return undefined
  }, context)
}

function conditionHolds(step: Extract<FlowStep, { kind: 'condition' }>, context: Record<string, unknown>): boolean {
  const raw = readField(context, step.field)
  if (raw === undefined || raw === null) return false
  switch (step.operator) {
    case 'gt':
      return Number(raw) > Number(step.value)
    case 'lt':
      return Number(raw) < Number(step.value)
    case 'eq':
      return String(raw) === step.value
    case 'contains':
      return String(raw).toLowerCase().includes(step.value.toLowerCase())
  }
}

function runAction(
  step: Extract<FlowStep, { kind: 'action' }>,
  context: Record<string, unknown>,
): string {
  const store = db()
  switch (step.action) {
    case 'notify':
      return `Notified ${step.target}: ${step.message}`
    case 'create_task':
      return `Task queued for ${step.target}: ${step.message}`
    case 'kill_flag': {
      const flag = store.flags.find((candidate) => candidate.key === step.target || candidate.id === step.target)
      if (!flag) return `Flag ${step.target} not found; no change made.`
      flag.killed = true
      for (const env of Object.values(flag.environments)) env.enabled = false
      return `Kill switch applied to ${flag.key} in all environments.`
    }
    case 'escalate_case': {
      const caseId = step.target === 'auto' ? String(readField(context, 'payload.caseId') ?? '') : step.target
      const kycCase = store.kycCases.find((candidate) => candidate.id === caseId)
      if (!kycCase) return `No KYC case matched ${caseId || 'the event payload'}; notification only.`
      kycCase.status = 'escalated'
      kycCase.decisionNotes = step.message
      return `Case ${kycCase.id} escalated to MLRO.`
    }
    case 'post_stream': {
      const connector = store.connectors.find((candidate) => candidate.id === step.target)
      if (!connector) return `Connector ${step.target} not found.`
      connector.eventsToday += 1
      connector.lastEventAt = timestamp()
      return `Published to ${connector.name} (${connector.topic}).`
    }
  }
}

export function runFlow(flow: Flow, context: Record<string, unknown>, triggeredBy: string, triggerEventId: string): FlowRun {
  const steps: FlowRunStep[] = []
  let status: FlowRun['status'] = 'completed'

  for (const step of flow.steps) {
    if (step.kind === 'condition') {
      const passed = conditionHolds(step, context)
      steps.push({
        stepId: step.id,
        kind: 'condition',
        outcome: passed ? 'passed' : 'stopped',
        detail: `${step.field} ${step.operator} ${step.value} → ${passed}`,
      })
      if (!passed) {
        status = 'stopped'
        break
      }
    } else if (step.kind === 'approval') {
      const task = {
        id: randomId('task'),
        flowRunId: '',
        title: `${flow.name}: approval required`,
        approverRole: step.approverRole,
        dueAt: new Date(Date.now() + step.slaHours * HOUR).toISOString(),
        status: 'open' as const,
      }
      db().flowTasks.unshift(task)
      steps.push({
        stepId: step.id,
        kind: 'approval',
        outcome: 'awaiting_approval',
        detail: `Awaiting ${step.approverRole} within ${step.slaHours}h (task ${task.id}).`,
      })
      status = 'awaiting_approval'
      break
    } else {
      steps.push({ stepId: step.id, kind: 'action', outcome: 'executed', detail: runAction(step, context) })
    }
  }

  const run: FlowRun = {
    id: randomId('run'),
    flowId: flow.id,
    triggeredBy,
    triggerEventId,
    startedAt: timestamp(),
    status,
    steps,
  }
  const store = db()
  for (const task of store.flowTasks) if (!task.flowRunId) task.flowRunId = run.id
  store.flowRuns.unshift(run)
  store.flowRuns = store.flowRuns.slice(0, 100)
  flow.runCount += 1
  flow.lastRunAt = run.startedAt

  appendAudit({
    eventType: 'flow.run',
    actor: { id: `flow:${flow.id}`, email: flow.owner, roles: [] },
    resource: 'flow',
    resourceId: flow.id,
    outcome: status === 'stopped' ? 'deny' : 'allow',
    reason: status === 'stopped' ? 'Condition not met.' : undefined,
    metadata: { runId: run.id, trigger: flow.trigger, status, steps: steps.length },
  })
  return run
}

export function dispatch(trigger: TriggerType, context: Record<string, unknown>, triggeredBy: string, eventId: string): FlowRun[] {
  return db()
    .flows.filter((flow) => flow.status === 'active' && flow.trigger === trigger)
    .map((flow) => runFlow(flow, context, triggeredBy, eventId))
}

const TRIGGER_EVENTS: Record<string, TriggerType> = {
  'refund.created': 'refund.created',
  'refund.approved': 'refund.approved',
  'payment.settled': 'payment.settled',
  'payment.executed': 'payment.settled',
  'kyc.escalated': 'kyc.escalate',
  'document.uploaded': 'document.uploaded',
  'stream.event_accepted': 'stream.event_accepted',
}

const runtime = globalThis as unknown as { __northwindFlowRuntime?: boolean }

/** Subscribes the flow engine to the audit/stream bus exactly once per process. */
export function ensureFlowRuntime(): void {
  if (runtime.__northwindFlowRuntime) return
  runtime.__northwindFlowRuntime = true
  subscribe((event: AuditEvent | StreamEvent) => {
    if (!('eventType' in event)) return
    if (event.eventType.startsWith('flow.')) return
    const trigger = TRIGGER_EVENTS[event.eventType]
    if (!trigger) return
    const after = (event.after ?? {}) as Record<string, unknown>
    const metadata = event.metadata ?? {}
    dispatch(
      trigger,
      { ...after, ...metadata, payload: { ...after, ...metadata }, topic: String(metadata.topic ?? '') },
      event.actorId,
      event.id,
    )
  })
}
