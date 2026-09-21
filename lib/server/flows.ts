import { appendAudit, subscribe } from './audit'
import { maskEmail, maskName, randomId } from './crypto'
import { db, timestamp } from './store'
import { ingest, signPayload } from './streams'
import type { Flow, FlowRun, FlowRunStep, FlowStep, FlowTask, TriggerType } from './studio-types'
import type { AuditEvent, StreamEvent } from './types'

/**
 * Flow runtime. Flows are declarative (trigger -> lookup/transform/condition ->
 * approval -> action) and run server-side off the same audit stream every
 * mutation writes to, so an automation can never bypass a control it was built
 * on top of. Every step records the context it received and the context it
 * produced so a maker can watch data move through the flow.
 */

const HOUR = 60 * 60 * 1000
type Context = Record<string, unknown>

export function readField(context: Context, field: string): unknown {
  return field.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Context)[key]
    return undefined
  }, context)
}

function setField(context: Context, field: string, value: unknown): Context {
  const [head, ...rest] = field.split('.')
  if (rest.length === 0) return { ...context, [head]: value }
  const child = context[head]
  return { ...context, [head]: setField(child && typeof child === 'object' ? (child as Context) : {}, rest.join('.'), value) }
}

/** Replaces {{path}} tokens with values from the context. Unknown paths render as empty strings. */
export function interpolate(template: string, context: Context): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = readField(context, path)
    if (value === undefined || value === null) return ''
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  })
}

/**
 * Tiny arithmetic evaluator (+ - * / parentheses, unary minus). No `eval`, no
 * identifiers: the template has already been interpolated, so anything that is
 * not a pure numeric expression is returned as a string.
 */
export function evaluateExpression(template: string, context: Context): unknown {
  const text = interpolate(template, context).trim()
  if (text === '') return ''
  if (!/^[\d\s+\-*/().]+$/.test(text)) {
    if (text === 'true') return true
    if (text === 'false') return false
    return text
  }
  let index = 0
  const peek = () => text[index]
  const skip = () => {
    while (text[index] === ' ') index += 1
  }
  const parsePrimary = (): number => {
    skip()
    if (peek() === '(') {
      index += 1
      const value = parseSum()
      skip()
      if (peek() !== ')') throw new Error('Unbalanced parentheses')
      index += 1
      return value
    }
    if (peek() === '-') {
      index += 1
      return -parsePrimary()
    }
    const match = /^\d+(\.\d+)?/.exec(text.slice(index))
    if (!match) throw new Error(`Unexpected token at ${index}`)
    index += match[0].length
    return Number(match[0])
  }
  const parseProduct = (): number => {
    let value = parsePrimary()
    for (;;) {
      skip()
      const op = peek()
      if (op !== '*' && op !== '/') return value
      index += 1
      const right = parsePrimary()
      value = op === '*' ? value * right : value / right
    }
  }
  const parseSum = (): number => {
    let value = parseProduct()
    for (;;) {
      skip()
      const op = peek()
      if (op !== '+' && op !== '-') return value
      index += 1
      const right = parseProduct()
      value = op === '+' ? value + right : value - right
    }
  }
  try {
    const result = parseSum()
    skip()
    if (index !== text.length) return text
    return Number.isInteger(result) ? result : Number(result.toFixed(4))
  } catch {
    return text
  }
}

function conditionHolds(step: Extract<FlowStep, { kind: 'condition' }>, context: Context): boolean {
  const raw = readField(context, step.field)
  if (raw === undefined || raw === null) return false
  const expected = interpolate(step.value, context)
  switch (step.operator) {
    case 'gt':
      return Number(raw) > Number(expected)
    case 'lt':
      return Number(raw) < Number(expected)
    case 'eq':
      return String(raw) === expected
    case 'contains':
      return String(raw).toLowerCase().includes(expected.toLowerCase())
  }
}

/** Governed record lookups. PII is masked before it enters the flow context. */
function lookup(step: Extract<FlowStep, { kind: 'lookup' }>, context: Context): { record: Context | null; key: string } {
  const store = db()
  const key = String(readField(context, step.keyField) ?? '')
  switch (step.resource) {
    case 'refund': {
      const refund = store.refunds.find((candidate) => candidate.id === key)
      if (!refund) return { record: null, key }
      const { customerName, customerEmail, ...rest } = refund
      return { record: { ...rest, customerName: maskName(customerName), customerEmail: maskEmail(customerEmail), approvals: refund.approvals.length }, key }
    }
    case 'kyc_case': {
      const kycCase = store.kycCases.find((candidate) => candidate.id === key || candidate.customerId === key)
      if (!kycCase) return { record: null, key }
      const { customerName, customerEmail, dateOfBirth: _dob, ...rest } = kycCase
      return { record: { ...rest, customerName: maskName(customerName), customerEmail: maskEmail(customerEmail) }, key }
    }
    case 'payment': {
      const payment = store.payments.find((candidate) => candidate.id === key || candidate.refundId === key)
      return { record: payment ? { ...payment } : null, key }
    }
    case 'flag': {
      const flag = store.flags.find((candidate) => candidate.key === key || candidate.id === key)
      return { record: flag ? { id: flag.id, key: flag.key, riskTier: flag.riskTier, killed: flag.killed, environments: flag.environments } : null, key }
    }
    case 'connector': {
      const connector = store.connectors.find((candidate) => candidate.id === key || candidate.topic === key)
      return { record: connector ? { id: connector.id, name: connector.name, topic: connector.topic, status: connector.status, piiFields: connector.piiFields } : null, key }
    }
  }
}

function runAction(step: Extract<FlowStep, { kind: 'action' }>, context: Context): { detail: string; output: Context } {
  const store = db()
  const target = interpolate(step.target, context)
  const message = interpolate(step.message, context)
  switch (step.action) {
    case 'notify': {
      const notificationId = randomId('ntf')
      return {
        detail: `Notified ${target}: ${message}`,
        output: { notification: { id: notificationId, channel: target, message, deliveredAt: timestamp() } },
      }
    }
    case 'create_task': {
      const taskId = randomId('wrk')
      return { detail: `Task ${taskId} queued for ${target}: ${message}`, output: { task: { id: taskId, queue: target, message, createdAt: timestamp() } } }
    }
    case 'kill_flag': {
      const flag = store.flags.find((candidate) => candidate.key === target || candidate.id === target)
      if (!flag) return { detail: `Flag ${target} not found; no change made.`, output: { flag: null } }
      const before = Object.fromEntries(Object.entries(flag.environments).map(([env, state]) => [env, state.enabled]))
      flag.killed = true
      for (const env of Object.values(flag.environments)) env.enabled = false
      const after = Object.fromEntries(Object.entries(flag.environments).map(([env, state]) => [env, state.enabled]))
      return { detail: `Kill switch applied to ${flag.key} in all environments.`, output: { flag: { key: flag.key, killed: true, before, after } } }
    }
    case 'escalate_case': {
      const caseId = target === 'auto' ? String(readField(context, 'payload.caseId') ?? readField(context, 'caseId') ?? '') : target
      const kycCase = store.kycCases.find((candidate) => candidate.id === caseId || candidate.customerId === caseId)
      if (!kycCase) return { detail: `No KYC case matched ${caseId || 'the event payload'}; notification only.`, output: { case: null } }
      const before = kycCase.status
      kycCase.status = 'escalated'
      kycCase.decisionNotes = message
      return { detail: `Case ${kycCase.id} escalated to MLRO.`, output: { case: { id: kycCase.id, before, after: 'escalated', notes: message } } }
    }
    case 'post_stream': {
      const connector = store.connectors.find((candidate) => candidate.id === target)
      if (!connector) return { detail: `Connector ${target} not found.`, output: { published: null } }
      const { payload: _payload, ...body } = context
      const raw = JSON.stringify({ ...body, message })
      const { event } = ingest(connector.id, raw, signPayload(connector.secretRef, raw))
      return {
        detail: `Published to ${connector.name} (${connector.topic}) as ${event.id}.`,
        output: { published: { eventId: event.id, connector: connector.name, topic: connector.topic, status: event.status, piiRedacted: connector.piiFields } },
      }
    }
  }
}

function labelFor(step: FlowStep, index: number): string {
  switch (step.kind) {
    case 'condition':
      return `Condition #${index + 1}`
    case 'approval':
      return `Approval #${index + 1}`
    case 'lookup':
      return `Lookup #${index + 1}`
    case 'transform':
      return `Transform #${index + 1}`
    case 'action':
      return `Action #${index + 1}`
  }
}

function changedKeys(before: Context, after: Context): string[] {
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
}

interface ExecuteResult {
  steps: FlowRunStep[]
  status: FlowRun['status']
  context: Context
  task?: FlowTask
}

/** Executes steps from `from` until the flow finishes, stops, or reaches a human approval gate. */
function execute(flow: Flow, from: number, context: Context, run: Pick<FlowRun, 'id' | 'mode'>): ExecuteResult {
  const steps: FlowRunStep[] = []
  let status: FlowRun['status'] = 'completed'
  let task: FlowTask | undefined

  for (let index = from; index < flow.steps.length; index += 1) {
    const step = flow.steps[index]
    const started = performance.now()
    const input = context
    const base = { stepId: step.id, kind: step.kind, label: labelFor(step, index), input }
    const finish = (partial: Omit<FlowRunStep, 'stepId' | 'kind' | 'label' | 'input' | 'durationMs' | 'changed'>): FlowRunStep => ({
      ...base,
      ...partial,
      changed: changedKeys(input, partial.output),
      durationMs: Math.max(1, Math.round(performance.now() - started)),
    })

    try {
      if (step.kind === 'condition') {
        const passed = conditionHolds(step, context)
        const actual = readField(context, step.field)
        steps.push(
          finish({
            outcome: passed ? 'passed' : 'stopped',
            detail: `${step.field} (${JSON.stringify(actual ?? null)}) ${step.operator} ${interpolate(step.value, context)} → ${passed}`,
            output: context,
          }),
        )
        if (!passed) {
          status = 'stopped'
          break
        }
      } else if (step.kind === 'lookup') {
        const { record, key } = lookup(step, context)
        context = setField(context, step.as, record)
        steps.push(
          finish({
            outcome: 'executed',
            detail: record ? `Loaded ${step.resource} ${key} into ${step.as} (PII masked).` : `No ${step.resource} matched ${step.keyField}=${key || '∅'}; ${step.as} is null.`,
            output: context,
          }),
        )
      } else if (step.kind === 'transform') {
        const assigned: string[] = []
        for (const assignment of step.assignments) {
          if (!assignment.field.trim()) continue
          context = setField(context, assignment.field, evaluateExpression(assignment.expression, context))
          assigned.push(`${assignment.field} = ${JSON.stringify(readField(context, assignment.field))}`)
        }
        steps.push(finish({ outcome: 'executed', detail: assigned.length ? assigned.join('; ') : 'No assignments.', output: context }))
      } else if (step.kind === 'approval') {
        const summary = interpolate(
          typeof context.summary === 'string' ? context.summary : `{{amountMinor}} {{currency}} · {{entity}} · {{topic}}`,
          context,
        )
          .replace(/\s*·\s*(?=·|$)/g, '')
          .trim()
        task = {
          id: randomId('task'),
          flowRunId: run.id,
          stepId: step.id,
          title: `${flow.name}: approval required${run.mode === 'test' ? ' (test run)' : ''}`,
          summary,
          approverRole: step.approverRole,
          dueAt: new Date(Date.now() + step.slaHours * HOUR).toISOString(),
          status: 'open',
        }
        db().flowTasks.unshift(task)
        steps.push(
          finish({
            outcome: 'awaiting_approval',
            detail: `Awaiting ${step.approverRole} within ${step.slaHours}h (task ${task.id}). The run resumes when the task is decided.`,
            output: context,
          }),
        )
        status = 'awaiting_approval'
        break
      } else {
        const result = runAction(step, context)
        context = { ...context, ...result.output }
        steps.push(finish({ outcome: 'executed', detail: result.detail, output: context }))
      }
    } catch (caught) {
      steps.push(finish({ outcome: 'failed', detail: caught instanceof Error ? caught.message : 'Step failed', output: context }))
      status = 'failed'
      break
    }
  }

  return { steps, status, context, task }
}

export interface RunOptions {
  mode?: FlowRun['mode']
  /** Test an unsaved definition without mutating the stored flow. */
  stepsOverride?: FlowStep[]
}

export function runFlow(flow: Flow, context: Context, triggeredBy: string, triggerEventId: string, options: RunOptions = {}): FlowRun {
  const definition: Flow = options.stepsOverride ? { ...flow, steps: options.stepsOverride } : flow
  const mode = options.mode ?? 'live'
  const runId = randomId('run')
  const input = { ...context, trigger: flow.trigger, run: { id: runId, mode, triggeredBy, at: timestamp() } }
  const result = execute(definition, 0, input, { id: runId, mode })

  const run: FlowRun = {
    id: runId,
    flowId: flow.id,
    flowName: flow.name,
    trigger: flow.trigger,
    mode,
    triggeredBy,
    triggerEventId,
    startedAt: timestamp(),
    finishedAt: result.status === 'awaiting_approval' ? undefined : timestamp(),
    status: result.status,
    input,
    output: result.context,
    definition: JSON.parse(JSON.stringify(definition.steps)) as FlowStep[],
    steps: result.steps,
  }
  const store = db()
  store.flowRuns.unshift(run)
  store.flowRuns = store.flowRuns.slice(0, 100)
  flow.runCount += 1
  flow.lastRunAt = run.startedAt

  appendAudit({
    eventType: 'flow.run',
    actor: { id: `flow:${flow.id}`, email: flow.owner, roles: [] },
    resource: 'flow',
    resourceId: flow.id,
    outcome: result.status === 'stopped' || result.status === 'failed' ? 'deny' : 'allow',
    reason: result.status === 'stopped' ? 'Condition not met.' : result.status === 'failed' ? 'A step failed.' : undefined,
    metadata: { runId: run.id, trigger: flow.trigger, status: result.status, steps: result.steps.length, mode },
  })
  return run
}

/** Continues a run after its approval task is decided. Rejection stops the run; approval executes the remaining steps. */
export function resumeRun(run: FlowRun, task: FlowTask, decision: 'approved' | 'rejected', decidedBy: string, notes: string): FlowRun {
  const flow: Flow | undefined = db().flows.find((candidate) => candidate.id === run.flowId)
  const definition: Flow = { ...(flow ?? { id: run.flowId, name: run.flowName, description: '', owner: run.triggeredBy, environment: 'development', trigger: run.trigger, status: 'active', connectors: [], createdAt: run.startedAt, runCount: 0 }), steps: run.definition }
  const gate = run.steps.find((step) => step.stepId === task.stepId)
  if (gate) {
    gate.outcome = decision === 'approved' ? 'executed' : 'stopped'
    gate.detail = `${decision} by ${decidedBy}: ${notes}`
    gate.output = { ...gate.input, approval: { taskId: task.id, decision, decidedBy, notes, decidedAt: timestamp() } }
    gate.changed = ['approval']
  }
  const context = gate?.output ?? run.output

  if (decision === 'rejected') {
    run.status = 'stopped'
    run.output = context
    run.finishedAt = timestamp()
    return run
  }

  const gateIndex = definition.steps.findIndex((step) => step.id === task.stepId)
  const result = execute(definition, gateIndex + 1, context, { id: run.id, mode: run.mode })
  run.steps = [...run.steps, ...result.steps]
  run.status = result.status
  run.output = result.context
  run.finishedAt = result.status === 'awaiting_approval' ? undefined : timestamp()
  return run
}

export function dispatch(trigger: TriggerType, context: Context, triggeredBy: string, eventId: string): FlowRun[] {
  return db()
    .flows.filter((flow) => flow.status === 'active' && flow.trigger === trigger)
    .map((flow) => runFlow(flow, context, triggeredBy, eventId))
}

/** Realistic sample events per trigger, derived from seeded records so lookups resolve. */
export function sampleEvents(): Record<TriggerType, Context> {
  const store = db()
  const refund = store.refunds.find((candidate) => candidate.status === 'pending') ?? store.refunds[0]
  const approved = store.refunds.find((candidate) => candidate.status === 'approved') ?? refund
  const payment = store.payments.find((candidate) => candidate.status === 'settled') ?? store.payments[0]
  const kycCase = store.kycCases.find((candidate) => candidate.sanctionsScreening.result !== 'clear') ?? store.kycCases[0]
  const document = store.documents[0]
  const screening = store.connectors.find((candidate) => candidate.topic.includes('screening')) ?? store.connectors[0]

  const refundEvent = (source: typeof refund, status: string): Context => ({
    refundId: source.id,
    amountMinor: source.amountMinor,
    currency: source.currency,
    entity: source.entity,
    priority: source.priority,
    reason: source.reason,
    status,
    requestedBy: source.requestedBy,
    customerId: source.customerId,
  })

  return {
    'refund.created': refundEvent(refund, 'pending'),
    'refund.approved': { ...refundEvent(approved, 'approved'), approvals: approved.approvals.length },
    'payment.settled': {
      paymentId: payment.id,
      refundId: payment.refundId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: 'settled',
      pspReference: payment.pspReference ?? 'psp_ref_demo',
      screening: payment.screening,
    },
    'payment.execute': { paymentId: payment.id, refundId: payment.refundId, amountMinor: payment.amountMinor, currency: payment.currency, status: 'submitted' },
    'kyc.escalate': {
      caseId: kycCase.id,
      customerId: kycCase.customerId,
      riskRating: kycCase.riskRating,
      country: kycCase.country,
      entity: kycCase.entity,
      sanctions: kycCase.sanctionsScreening.result,
      pep: kycCase.pepScreening.result,
      status: 'escalated',
    },
    'document.uploaded': document
      ? { documentId: document.id, caseId: document.caseId, kind: document.kind, sizeBytes: document.sizeBytes, residency: document.residency, sha256: document.sha256.slice(0, 16) }
      : { documentId: 'doc_demo', caseId: kycCase.id, kind: 'passport', sizeBytes: 482_113, residency: 'eu-west-1' },
    'stream.event_accepted': {
      topic: screening.topic,
      connectorId: screening.id,
      payload: { caseId: kycCase.id, customerId: kycCase.customerId, sanctions: 'potential_match', score: 0.91, provider: kycCase.sanctionsScreening.provider },
    },
    'schedule.daily': { date: new Date().toISOString().slice(0, 10), openRefunds: store.refunds.filter((candidate) => candidate.status === 'pending').length, openCases: store.kycCases.filter((candidate) => candidate.status !== 'approved' && candidate.status !== 'rejected').length },
  }
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
    const after = (event.after ?? {}) as Context
    const metadata = event.metadata ?? {}
    dispatch(
      trigger,
      { ...after, ...metadata, payload: { ...after, ...metadata }, topic: String(metadata.topic ?? after.topic ?? ''), sourceEvent: event.id },
      event.actorId,
      event.id,
    )
  })
}
