import { randomId } from './crypto'
import { findEntity } from './datasources'
import { db, timestamp } from './store'
import type { AppScreen, AppTemplate, ComponentDefinition, DataResource, MakerApp, TriggerType } from './studio-types'
import type { Environment, RoleId, User } from './types'
import { permissionsFor } from './policy'

/**
 * Reusable governed components. A maker drags these onto a screen; each one
 * carries its own permission gate and controls, so an app assembled in the
 * studio cannot leak data a hand-written page would have protected.
 */
export const componentCatalog: ComponentDefinition[] = [
  {
    id: 'queue_table',
    name: 'Work Queue',
    description: 'Filterable, scope-aware record table with per-user saved views.',
    category: 'data',
    requiredPermission: 'app:read',
    governance: ['Entity-scope filtering', 'PII masking by permission', 'Read audited'],
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'resource', label: 'Data source', type: 'resource' },
      { key: 'binding', label: 'External entity', type: 'binding' },
      { key: 'columns', label: 'Columns', type: 'columns' },
      { key: 'pageSize', label: 'Rows per page', type: 'number' },
    ],
  },
  {
    id: 'kpi_strip',
    name: 'KPI Strip',
    description: 'Aggregate counters computed server-side from the bound data source.',
    category: 'insight',
    requiredPermission: 'app:read',
    governance: ['Aggregates only, no row-level leakage'],
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'resource', label: 'Data source', type: 'resource' },
    ],
  },
  {
    id: 'approval_panel',
    name: 'Approval Panel',
    description: 'Maker-checker approve/reject control wired to the policy engine.',
    category: 'governance',
    requiredPermission: 'app:read',
    governance: ['Maker-checker enforced', 'MFA required', 'Threshold approvals', 'Decision audited'],
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'resource', label: 'Data source', type: 'resource' },
    ],
  },
  {
    id: 'document_uploader',
    name: 'Secure Document Uploader',
    description: 'AES-256-GCM envelope upload with checksum, residency and retention tagging.',
    category: 'input',
    requiredPermission: 'app:read',
    governance: ['Encrypted at rest', 'SHA-256 checksum', 'Retention + legal hold', 'Single-use download grants'],
    props: [{ key: 'title', label: 'Title', type: 'text' }],
  },
  {
    id: 'audit_trail',
    name: 'Audit Trail',
    description: 'Hash-chained activity for the bound records with chain verification.',
    category: 'governance',
    requiredPermission: 'app:read',
    governance: ['Append-only', 'Tamper-evident hash chain', 'PII masked unless auditor'],
    props: [{ key: 'title', label: 'Title', type: 'text' }],
  },
  {
    id: 'record_form',
    name: 'Record Form',
    description: 'Create or edit a record with server-side validation and field-level permissions.',
    category: 'input',
    requiredPermission: 'app:read',
    governance: ['Field-level permissions', 'Change audited with before/after'],
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'resource', label: 'Data source', type: 'resource' },
      { key: 'binding', label: 'External entity', type: 'binding' },
    ],
  },
  {
    id: 'chart',
    name: 'Trend Chart',
    description: 'Time series over the bound data source.',
    category: 'insight',
    requiredPermission: 'app:read',
    governance: ['Aggregates only'],
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'resource', label: 'Data source', type: 'resource' },
      { key: 'binding', label: 'External entity', type: 'binding' },
    ],
  },
  {
    id: 'filter_bar',
    name: 'Filter Bar',
    description: 'Shared filter state persisted as a per-user saved view.',
    category: 'data',
    requiredPermission: 'app:read',
    governance: ['Per-user views', 'Shared views require view:share'],
    props: [{ key: 'title', label: 'Title', type: 'text' }],
  },
]

const screen = (id: string, name: string, components: AppScreen['components']): AppScreen => ({ id, name, components })
const instance = (componentId: AppScreen['components'][number]['componentId'], props: Record<string, unknown>) => ({
  instanceId: randomId('cmp'),
  componentId,
  props,
})

export const templateCatalog: AppTemplate[] = [
  {
    id: 'tpl_refund_ops',
    name: 'Refund Operations Console',
    description: 'Queue, threshold approvals and payout tracking for refund teams.',
    category: 'operations',
    icon: 'banknote',
    resource: 'refunds',
    defaultRoles: ['manager', 'processor', 'analyst'],
    connectors: ['cnx_8001', 'cnx_8002'],
    screens: [
      screen('scr_overview', 'Overview', [
        instance('kpi_strip', { title: 'Refund throughput', resource: 'refunds' }),
        instance('queue_table', { title: 'Open refunds', resource: 'refunds', columns: ['id', 'customerName', 'amount', 'status', 'riskScore'] }),
      ]),
      screen('scr_approvals', 'Approvals', [
        instance('approval_panel', { title: 'Awaiting decision', resource: 'refunds' }),
        instance('audit_trail', { title: 'Decision history' }),
      ]),
    ],
  },
  {
    id: 'tpl_kyc_review',
    name: 'KYC Review Workbench',
    description: 'Four-eyes CDD review with encrypted evidence handling and SLA tracking.',
    category: 'compliance',
    icon: 'id-card',
    resource: 'kyc',
    defaultRoles: ['kyc_reviewer', 'kyc_approver'],
    connectors: ['cnx_8003'],
    screens: [
      screen('scr_queue', 'Case queue', [
        instance('kpi_strip', { title: 'Case load', resource: 'kyc' }),
        instance('queue_table', { title: 'Cases', resource: 'kyc', columns: ['id', 'customerName', 'riskRating', 'status', 'slaDueAt'] }),
      ]),
      screen('scr_evidence', 'Evidence', [
        instance('document_uploader', { title: 'Upload CDD evidence' }),
        instance('audit_trail', { title: 'Document access log' }),
      ]),
    ],
  },
  {
    id: 'tpl_payout_control',
    name: 'Payout Control Tower',
    description: 'Dual-approval payout release, PSP status and ledger reconciliation.',
    category: 'finance',
    icon: 'wallet',
    resource: 'payments',
    defaultRoles: ['payments_operator', 'manager'],
    connectors: ['cnx_8002'],
    screens: [
      screen('scr_release', 'Release', [
        instance('kpi_strip', { title: 'Settlement status', resource: 'payments' }),
        instance('approval_panel', { title: 'Payouts awaiting release', resource: 'payments' }),
      ]),
      screen('scr_recon', 'Reconciliation', [
        instance('queue_table', { title: 'Ledger postings', resource: 'payments', columns: ['id', 'refundId', 'amount', 'status', 'reconciledAt'] }),
      ]),
    ],
  },
  {
    id: 'tpl_control_attestation',
    name: 'Control Attestation Tracker',
    description: 'Evidence-backed control register for SOC 2, DORA and AMLR reviews.',
    category: 'compliance',
    icon: 'shield-check',
    resource: 'audit',
    defaultRoles: ['auditor', 'admin'],
    connectors: [],
    screens: [
      screen('scr_controls', 'Controls', [
        instance('kpi_strip', { title: 'Control posture', resource: 'audit' }),
        instance('audit_trail', { title: 'Evidence trail' }),
      ]),
    ],
  },
  {
    id: 'tpl_experiment_governance',
    name: 'Experiment Governance Board',
    description: 'Flag change requests, compliance sign-off and kill-switch control.',
    category: 'risk',
    icon: 'flask',
    resource: 'flags',
    defaultRoles: ['experiment_owner', 'manager'],
    connectors: [],
    screens: [
      screen('scr_flags', 'Flags', [
        instance('queue_table', { title: 'Flags', resource: 'flags', columns: ['key', 'riskTier', 'production', 'owner'] }),
        instance('approval_panel', { title: 'Change requests', resource: 'flags' }),
      ]),
    ],
  },
  {
    id: 'tpl_blank',
    name: 'Blank app',
    description: 'Start from an empty screen and compose governed components.',
    category: 'operations',
    icon: 'square-dashed',
    resource: 'refunds',
    defaultRoles: [],
    connectors: [],
    screens: [screen('scr_main', 'Main', [])],
  },
]

export function instantiateTemplate(
  template: AppTemplate,
  input: { name?: string; owner: string; environment: Environment; audienceRoles?: RoleId[] },
): MakerApp {
  return {
    id: randomId('app'),
    name: input.name?.trim() || template.name,
    description: template.description,
    templateId: template.id,
    owner: input.owner,
    environment: input.environment,
    status: 'draft',
    resource: template.resource,
    // Deep clone so edits to a generated app never mutate the shared template.
    screens: template.screens.map((s) => ({
      ...s,
      components: s.components.map((c) => ({ ...c, instanceId: randomId('cmp'), props: { ...c.props } })),
    })),
    audienceRoles: input.audienceRoles ?? template.defaultRoles,
    connectors: [...template.connectors],
    version: 1,
    createdAt: timestamp(),
    updatedAt: timestamp(),
    sessions30d: 0,
  }
}

export interface SolutionCheck {
  id: string
  severity: 'error' | 'warning' | 'info'
  message: string
}

/** Power Apps "solution checker" analogue, run before an app can be published. */
export function checkApp(app: MakerApp): SolutionCheck[] {
  const checks: SolutionCheck[] = []
  const store = db()
  const components = app.screens.flatMap((s) => s.components)

  if (components.length === 0) checks.push({ id: 'empty-app', severity: 'error', message: 'App has no components on any screen.' })
  if (app.audienceRoles.length === 0) checks.push({ id: 'no-audience', severity: 'error', message: 'No audience roles assigned; nobody could open the app.' })

  const dlp = store.dlpPolicies.find((policy) => policy.environment === app.environment)
  if (dlp) {
    const blocked = app.connectors.filter((c) => dlp.blockedConnectors.includes(c))
    if (blocked.length) checks.push({ id: 'dlp-blocked', severity: 'error', message: `DLP policy "${dlp.name}" blocks connector(s): ${blocked.join(', ')}.` })
    const business = app.connectors.filter((c) => dlp.businessConnectors.includes(c))
    const nonBusiness = app.connectors.filter((c) => dlp.nonBusinessConnectors.includes(c))
    if (business.length && nonBusiness.length)
      checks.push({
        id: 'dlp-mix',
        severity: 'error',
        message: `DLP policy "${dlp.name}" forbids combining business and non-business connectors in one app.`,
      })
  }

  const bindings = components
    .map((c) => (typeof c.props.binding === 'string' ? c.props.binding : null))
    .filter((binding): binding is string => Boolean(binding))
  for (const binding of new Set(bindings)) {
    const [systemId, entityId] = binding.split('.')
    const bound = findEntity(systemId, entityId)
    if (!bound) {
      checks.push({ id: `binding-unknown:${binding}`, severity: 'error', message: `Component bound to unknown entity ${binding}.` })
      continue
    }
    if (dlp?.blockedConnectors.includes(bound.system.id))
      checks.push({ id: `dlp-binding:${binding}`, severity: 'error', message: `DLP policy "${dlp.name}" blocks ${bound.system.name} in ${app.environment}.` })
    if (bound.entity.classification === 'restricted' && app.audienceRoles.some((role) => role === 'viewer' || role === 'analyst'))
      checks.push({
        id: `restricted-audience:${binding}`,
        severity: 'error',
        message: `${bound.entity.name} is classified restricted but the app is published to ${app.audienceRoles.join(', ')}.`,
      })
    if (bound.entity.fields.some((field) => field.pii) && app.audienceRoles.length > 3)
      checks.push({ id: `pii-wide:${binding}`, severity: 'warning', message: `${bound.entity.name} contains PII and is exposed to ${app.audienceRoles.length} roles.` })
    if (bound.system.status !== 'connected')
      checks.push({ id: `system-health:${binding}`, severity: 'warning', message: `${bound.system.name} is currently ${bound.system.status}.` })
  }

  const hasApproval = components.some((c) => c.componentId === 'approval_panel')
  if (hasApproval && !components.some((c) => c.componentId === 'audit_trail'))
    checks.push({ id: 'approval-without-audit', severity: 'warning', message: 'Approval panel present without an audit trail component.' })
  if (app.resource === 'kyc' && !app.audienceRoles.every((role) => role.startsWith('kyc') || role === 'admin' || role === 'auditor'))
    checks.push({ id: 'kyc-audience', severity: 'warning', message: 'KYC data is published to roles outside the financial crime function.' })
  if (app.environment === 'production' && app.version === 1)
    checks.push({ id: 'prod-first-publish', severity: 'info', message: 'First production publish; change record will be written to the audit chain.' })

  return checks
}

export function visibleApps(user: User): MakerApp[] {
  const permissions = permissionsFor(user)
  return db().apps.filter(
    (app) =>
      app.owner === user.id ||
      permissions.includes('platform:govern') ||
      (app.status === 'published' && app.audienceRoles.some((role) => user.roles.includes(role))),
  )
}

export const dataResources: DataResource[] = ['refunds', 'kyc', 'payments', 'audit', 'flags']

export const triggerCatalog: { id: TriggerType; label: string; description: string }[] = [
  { id: 'refund.created', label: 'Refund created', description: 'A refund request is raised.' },
  { id: 'refund.approved', label: 'Refund approved', description: 'A refund clears its approval threshold.' },
  { id: 'payment.settled', label: 'Payout settled', description: 'The PSP confirms settlement.' },
  { id: 'kyc.escalate', label: 'KYC case escalated', description: 'A case is escalated to the MLRO.' },
  { id: 'document.uploaded', label: 'KYC document uploaded', description: 'New CDD evidence is stored.' },
  { id: 'stream.event_accepted', label: 'Stream event received', description: 'A signed event passes ingestion.' },
  { id: 'schedule.daily', label: 'Daily schedule', description: 'Runs once per day.' },
]

export const actionCatalog = [
  { id: 'notify', label: 'Notify team', targetLabel: 'Channel or team' },
  { id: 'create_task', label: 'Create task', targetLabel: 'Queue' },
  { id: 'kill_flag', label: 'Kill feature flag', targetLabel: 'Flag key' },
  { id: 'escalate_case', label: 'Escalate KYC case', targetLabel: 'Case id or "auto"' },
  { id: 'post_stream', label: 'Publish to connector', targetLabel: 'Connector id' },
] as const
