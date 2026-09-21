import type { Environment, Permission, RoleId } from './types'

/**
 * Low-code layer. Apps and flows are data, not code: a maker composes governed
 * components and the runtime renders them, so every generated app inherits the
 * same policy engine, audit trail and data-access rules as the hand-built ones.
 */

export type ComponentId =
  | 'queue_table'
  | 'kpi_strip'
  | 'approval_panel'
  | 'document_uploader'
  | 'audit_trail'
  | 'record_form'
  | 'chart'
  | 'filter_bar'

export interface ComponentDefinition {
  id: ComponentId
  name: string
  description: string
  category: 'data' | 'input' | 'insight' | 'governance'
  /** Permission the viewer must hold for the component to render at all. */
  requiredPermission: Permission
  /** Controls this component enforces automatically wherever it is dropped. */
  governance: string[]
  props: { key: string; label: string; type: 'text' | 'resource' | 'binding' | 'columns' | 'number' | 'boolean' }[]
}

export type DataResource = 'refunds' | 'kyc' | 'payments' | 'audit' | 'flags'

export interface ComponentInstance {
  instanceId: string
  componentId: ComponentId
  props: Record<string, unknown>
}

export interface AppScreen {
  id: string
  name: string
  components: ComponentInstance[]
}

export interface AppTemplate {
  id: string
  name: string
  description: string
  category: 'operations' | 'compliance' | 'finance' | 'risk'
  icon: string
  resource: DataResource
  /** Roles the generated app is published to by default. */
  defaultRoles: RoleId[]
  screens: AppScreen[]
  connectors: string[]
}

export interface MakerApp {
  id: string
  name: string
  description: string
  templateId?: string
  owner: string
  environment: Environment
  status: 'draft' | 'published'
  resource: DataResource
  screens: AppScreen[]
  audienceRoles: RoleId[]
  connectors: string[]
  version: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
  sessions30d: number
}

export type TriggerType =
  | 'refund.created'
  | 'refund.approved'
  | 'payment.settled'
  | 'payment.execute'
  | 'kyc.escalate'
  | 'document.uploaded'
  | 'stream.event_accepted'
  | 'schedule.daily'

export type LookupResource = 'refund' | 'kyc_case' | 'payment' | 'flag' | 'connector'

export type FlowStep =
  | { id: string; kind: 'condition'; field: string; operator: 'gt' | 'lt' | 'eq' | 'contains'; value: string }
  | { id: string; kind: 'approval'; approverRole: RoleId; slaHours: number }
  | { id: string; kind: 'action'; action: 'notify' | 'create_task' | 'kill_flag' | 'escalate_case' | 'post_stream'; target: string; message: string }
  /** Enrich the run context with a governed record (Power Automate "Get a row"). PII is masked. */
  | { id: string; kind: 'lookup'; resource: LookupResource; keyField: string; as: string }
  /** Compute new fields from the context. Expressions interpolate {{path}} and evaluate arithmetic. */
  | { id: string; kind: 'transform'; assignments: { field: string; expression: string }[] }

export interface Flow {
  id: string
  name: string
  description: string
  owner: string
  environment: Environment
  trigger: TriggerType
  steps: FlowStep[]
  status: 'draft' | 'active' | 'paused'
  connectors: string[]
  createdAt: string
  runCount: number
  lastRunAt?: string
}

export interface FlowRunStep {
  stepId: string
  kind: FlowStep['kind']
  label: string
  outcome: 'passed' | 'stopped' | 'executed' | 'awaiting_approval' | 'failed' | 'skipped'
  detail: string
  /** Context as the step saw it. */
  input: Record<string, unknown>
  /** Context after the step ran (conditions/approvals pass input through; lookups and transforms add fields). */
  output: Record<string, unknown>
  /** Fields the step added or changed, for a compact diff in the designer. */
  changed: string[]
  durationMs: number
}

export interface FlowRun {
  id: string
  flowId: string
  flowName: string
  trigger: TriggerType
  mode: 'test' | 'live'
  triggeredBy: string
  triggerEventId: string
  startedAt: string
  finishedAt?: string
  status: 'completed' | 'stopped' | 'awaiting_approval' | 'failed'
  input: Record<string, unknown>
  output: Record<string, unknown>
  /** Snapshot of the step definitions this run executed, so later edits to the flow cannot change what a paused run resumes into. */
  definition: FlowStep[]
  steps: FlowRunStep[]
}

export interface FlowTask {
  id: string
  flowRunId: string
  stepId: string
  title: string
  summary: string
  approverRole: RoleId
  dueAt: string
  status: 'open' | 'approved' | 'rejected'
  decidedBy?: string
  decidedAt?: string
}

/** Power Platform DLP analogue: connectors are classified and cannot be mixed. */
export interface DlpPolicy
 {
  id: string
  name: string
  environment: Environment
  businessConnectors: string[]
  nonBusinessConnectors: string[]
  blockedConnectors: string[]
}
