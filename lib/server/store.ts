import { encryptDocument, sha256 } from './crypto'
import type {
  AccessReview,
  AuditEvent,
  DownloadGrant,
  Experiment,
  FeatureFlag,
  FlagChangeRequest,
  KycCase,
  KycDocument,
  LedgerEntry,
  Payment,
  PaymentInstrument,
  Refund,
  SavedView,
  StreamConnector,
  StreamEvent,
  User,
} from './types'
import type { DlpPolicy, Flow, FlowRun, FlowTask, MakerApp } from './studio-types'

export interface Database {
  users: User[]
  refunds: Refund[]
  instruments: PaymentInstrument[]
  payments: Payment[]
  ledger: LedgerEntry[]
  kycCases: KycCase[]
  documents: KycDocument[]
  downloadGrants: DownloadGrant[]
  flags: FeatureFlag[]
  changeRequests: FlagChangeRequest[]
  experiments: Experiment[]
  views: SavedView[]
  connectors: StreamConnector[]
  streamEvents: StreamEvent[]
  auditEvents: AuditEvent[]
  accessReviews: AccessReview[]
  apps: MakerApp[]
  flows: Flow[]
  flowRuns: FlowRun[]
  flowTasks: FlowTask[]
  dlpPolicies: DlpPolicy[]
  /** idempotency key -> payment id, so a retried payout never double-pays. */
  idempotency: Map<string, string>
  subscribers: Set<(event: AuditEvent | StreamEvent) => void>
}

const DAY = 24 * 60 * 60 * 1000
const now = () => new Date()
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString()
const years = (n: number) => iso(n * 365 * DAY)

function seed(): Database {
  const users: User[] = [
    mkUser('usr_alice', 'Alice Johnson', 'alice.johnson@northwind.fi', ['admin'], 'Platform Engineering', '*'),
    mkUser('usr_bob', 'Bob Smith', 'bob.smith@northwind.fi', ['manager'], 'Operations', 'eu-entity'),
    mkUser('usr_carol', 'Carol Davis', 'carol.davis@northwind.fi', ['analyst'], 'Finance', '*'),
    mkUser('usr_dan', 'David Wilson', 'david.wilson@northwind.fi', ['processor'], 'Operations', 'eu-entity'),
    mkUser('usr_eva', 'Eva Martinez', 'eva.martinez@northwind.fi', ['auditor'], 'Internal Audit', '*'),
    mkUser('usr_frank', 'Frank Lee', 'frank.lee@northwind.fi', ['viewer'], 'Support', 'us-entity'),
    mkUser('usr_grace', 'Grace Okafor', 'grace.okafor@northwind.fi', ['kyc_reviewer'], 'Financial Crime', '*'),
    mkUser('usr_hana', 'Hana Yilmaz', 'hana.yilmaz@northwind.fi', ['kyc_approver'], 'Financial Crime', '*'),
    mkUser('usr_ivan', 'Ivan Petrov', 'ivan.petrov@northwind.fi', ['payments_operator'], 'Treasury', '*'),
    mkUser('usr_jia', 'Jia Chen', 'jia.chen@northwind.fi', ['experiment_owner'], 'Product', '*'),
    mkUser('usr_kai', 'Kai Andersson', 'kai.andersson@northwind.fi', ['director'], 'Executive', '*'),
  ]

  const instruments: PaymentInstrument[] = [
    mkInstrument('pi_001', 'cus_1001', 'visa', '4242', 'US'),
    mkInstrument('pi_002', 'cus_1002', 'sepa', '8891', 'DE'),
    mkInstrument('pi_003', 'cus_1003', 'mastercard', '5510', 'GB'),
    mkInstrument('pi_004', 'cus_1004', 'ach', '0031', 'US'),
    mkInstrument('pi_005', 'cus_1005', 'visa', '1111', 'FR'),
    mkInstrument('pi_006', 'cus_1006', 'amex', '3782', 'US'),
  ]

  const refunds: Refund[] = [
    mkRefund('rfd_1001', 'cus_1001', 'John Smith', 'john.smith@example.com', 14_995, 'USD', 'Duplicate charge', 'pending', 'medium', 'pi_001', 'us-entity', -2 * DAY),
    mkRefund('rfd_1002', 'cus_1002', 'Sarah Johnson', 'sarah.j@example.com', 7_550, 'EUR', 'Service not received', 'approved', 'low', 'pi_002', 'eu-entity', -3 * DAY),
    mkRefund('rfd_1003', 'cus_1003', 'Mike Davis', 'mike.davis@example.com', 129_900, 'GBP', 'Product defective', 'pending', 'high', 'pi_003', 'eu-entity', -1 * DAY),
    mkRefund('rfd_1004', 'cus_1004', 'Emily Chen', 'emily.chen@example.com', 4_500, 'USD', 'Wrong item sent', 'pending', 'medium', 'pi_004', 'us-entity', -6 * 60 * 60 * 1000),
    mkRefund('rfd_1005', 'cus_1005', 'Robert Wilson', 'robert.w@example.com', 612_000, 'EUR', 'Billing error on annual plan', 'pending', 'high', 'pi_005', 'eu-entity', -4 * DAY),
    mkRefund('rfd_1006', 'cus_1006', 'Lisa Park', 'lisa.park@example.com', 8_999, 'USD', 'Damaged during shipping', 'paid', 'high', 'pi_006', 'us-entity', -9 * DAY),
  ]
  refunds[1].approvals = [
    { actorId: 'usr_bob', actorEmail: 'bob.smith@northwind.fi', role: 'manager', decision: 'approved', notes: 'Cancellation confirmed in CRM.', at: iso(-2 * DAY) },
  ]
  refunds[5].approvals = [
    { actorId: 'usr_bob', actorEmail: 'bob.smith@northwind.fi', role: 'manager', decision: 'approved', notes: 'Photo evidence of damage attached.', at: iso(-8 * DAY) },
  ]
  refunds[5].paymentId = 'pay_9001'

  const payments: Payment[] = [
    {
      id: 'pay_9001',
      refundId: 'rfd_1006',
      idempotencyKey: 'seed-rfd_1006',
      amountMinor: 8_999,
      currency: 'USD',
      instrumentId: 'pi_006',
      status: 'settled',
      pspReference: 'psp_7f3a91',
      initiatedBy: 'usr_ivan',
      approvedBy: ['usr_bob'],
      createdAt: iso(-8 * DAY),
      updatedAt: iso(-8 * DAY),
      settledAt: iso(-7 * DAY),
      reconciledAt: iso(-7 * DAY),
      screening: { sanctions: 'clear', velocity: 'clear', at: iso(-8 * DAY) },
    },
  ]

  const ledger: LedgerEntry[] = [
    mkLedger('led_1', 'pay_9001', 'refunds_payable', 'debit', 8_999, 'USD', 'Refund REF-1006 approved'),
    mkLedger('led_2', 'pay_9001', 'cash_clearing', 'credit', 8_999, 'USD', 'Payout submitted to PSP'),
  ]

  const kycCases: KycCase[] = [
    mkCase('kyc_2001', 'cus_1001', 'John Smith', 'john.smith@example.com', 'US', 'low', 'in_review', 1),
    mkCase('kyc_2002', 'cus_1002', 'Sarah Johnson', 'sarah.j@example.com', 'DE', 'high', 'escalated', -1),
    mkCase('kyc_2003', 'cus_1003', 'Mike Davis', 'mike.davis@example.com', 'GB', 'medium', 'pending_documents', 2),
    mkCase('kyc_2004', 'cus_1007', 'Amara Nwosu', 'amara.n@example.com', 'NG', 'high', 'in_review', 0),
    mkCase('kyc_2005', 'cus_1005', 'Robert Wilson', 'robert.w@example.com', 'FR', 'low', 'approved', 5),
  ]
  kycCases[1].sanctionsScreening = { result: 'potential_match', provider: 'Dow Jones Risk & Compliance', at: iso(-2 * DAY) }
  kycCases[1].pepScreening = { result: 'potential_match', provider: 'Dow Jones Risk & Compliance', at: iso(-2 * DAY) }
  kycCases[3].sanctionsScreening = { result: 'clear', provider: 'Dow Jones Risk & Compliance', at: iso(-1 * DAY) }
  kycCases[4].decidedBy = 'usr_hana'
  kycCases[4].reviewedBy = 'usr_grace'
  kycCases[4].decidedAt = iso(-6 * DAY)
  kycCases[4].decisionNotes = 'Identity and address verified against two independent sources.'

  const documents: KycDocument[] = [
    mkDocument('doc_3001', 'kyc_2001', 'passport', 'passport-jsmith.pdf', 'usr_grace', 'verified'),
    mkDocument('doc_3002', 'kyc_2001', 'proof_of_address', 'utility-bill-jsmith.pdf', 'usr_grace', 'uploaded'),
    mkDocument('doc_3003', 'kyc_2002', 'passport', 'passport-sjohnson.pdf', 'usr_grace', 'verified'),
    mkDocument('doc_3004', 'kyc_2002', 'source_of_funds', 'sof-statement-sjohnson.pdf', 'usr_grace', 'uploaded'),
    mkDocument('doc_3005', 'kyc_2004', 'drivers_license', 'licence-anwosu.pdf', 'usr_grace', 'uploaded'),
  ]
  documents[3].legalHold = true

  const flags: FeatureFlag[] = [
    mkFlag('flg_4001', 'instant_refunds', 'Instant Refunds', 'Settle approved refunds within 30 minutes via faster payments.', 'risk', 'regulated', 'usr_jia', { development: [true, 100], staging: [true, 50], production: [false, 0] }),
    mkFlag('flg_4002', 'kyc_auto_approval', 'KYC Auto Approval', 'Auto-approve low-risk KYC cases that clear all screening.', 'compliance', 'regulated', 'usr_hana', { development: [true, 100], staging: [false, 0], production: [false, 0] }),
    mkFlag('flg_4003', 'new_refund_ui', 'Refunds Console Redesign', 'New queue layout for the refunds console.', 'ux', 'standard', 'usr_jia', { development: [true, 100], staging: [true, 100], production: [true, 25] }),
    mkFlag('flg_4004', 'ledger_streaming', 'Ledger Event Streaming', 'Publish ledger entries to Kafka in real time.', 'infrastructure', 'standard', 'usr_alice', { development: [true, 100], staging: [true, 100], production: [true, 100] }),
    mkFlag('flg_4005', 'dispute_autoscore', 'Dispute Auto-Scoring', 'Model-assisted scoring of dispute likelihood.', 'product', 'regulated', 'usr_jia', { development: [true, 100], staging: [true, 10], production: [false, 0] }),
  ]

  const changeRequests: FlagChangeRequest[] = [
    {
      id: 'chg_5001',
      flagId: 'flg_4001',
      environment: 'production',
      proposedBy: 'usr_jia',
      proposedAt: iso(-4 * 60 * 60 * 1000),
      justification: 'Pilot instant refunds for 5% of US customers after successful staging run.',
      ticket: 'RISK-2291',
      before: { enabled: false, rolloutPercent: 0 },
      after: { enabled: true, rolloutPercent: 5 },
      status: 'pending',
    },
  ]

  const experiments: Experiment[] = [
    {
      id: 'exp_6001',
      name: 'Instant refund uptake',
      hypothesis: 'Instant settlement reduces refund-related contacts by 20%.',
      flagId: 'flg_4001',
      owner: 'usr_jia',
      status: 'draft',
      audience: { segment: 'us-retail', percent: 5 },
      requiresComplianceSignoff: true,
      primaryMetric: 'refund_contact_rate',
      guardrailMetrics: ['chargeback_rate', 'fraud_loss_bps'],
    },
    {
      id: 'exp_6002',
      name: 'Refunds console redesign',
      hypothesis: 'The new queue layout cuts median handling time by 15%.',
      flagId: 'flg_4003',
      owner: 'usr_jia',
      status: 'running',
      audience: { segment: 'internal-ops', percent: 25 },
      requiresComplianceSignoff: false,
      startedAt: iso(-10 * DAY),
      primaryMetric: 'median_handling_seconds',
      guardrailMetrics: ['error_rate'],
    },
  ]

  const views: SavedView[] = [
    {
      id: 'vw_7001',
      ownerId: 'usr_bob',
      name: 'My EU approvals queue',
      resource: 'refunds',
      filters: { status: 'pending', entity: 'eu-entity' },
      columns: ['id', 'customerName', 'amount', 'reason', 'requestedAt', 'status'],
      sort: { field: 'amountMinor', direction: 'desc' },
      isDefault: true,
      shared: false,
      createdAt: iso(-20 * DAY),
    },
    {
      id: 'vw_7002',
      ownerId: 'usr_grace',
      name: 'SLA breach risk',
      resource: 'kyc',
      filters: { status: 'in_review', riskRating: 'high' },
      columns: ['id', 'customerName', 'riskRating', 'slaDueAt', 'status'],
      isDefault: true,
      shared: true,
      createdAt: iso(-15 * DAY),
    },
  ]

  const connectors: StreamConnector[] = [
    mkConnector('cnx_8001', 'Core Ledger CDC', 'postgres_cdc', 'inbound', 'ledger.entries.v2', 'connected', 'vault://kv/data/ledger-cdc', 18_420, 0, ['customerEmail']),
    mkConnector('cnx_8002', 'PSP Webhooks', 'webhook', 'inbound', 'psp.payout.status', 'connected', 'vault://kv/data/psp-webhook-hmac', 2_140, 0, []),
    mkConnector('cnx_8003', 'Sanctions Screening Feed', 'kafka', 'inbound', 'screening.results.v1', 'connected', 'vault://kv/data/screening-kafka', 940, 3, ['customerName']),
    mkConnector('cnx_8004', 'Snowflake Reverse ETL', 'snowflake', 'outbound', 'analytics.refund_metrics', 'degraded', 'vault://kv/data/snowflake', 120, 12, []),
    mkConnector('cnx_8005', 'Regulatory Reporting SFTP', 'sftp', 'outbound', 'reg.aml.daily', 'connected', 'vault://kv/data/reg-sftp', 1, 0, ['customerName', 'customerEmail']),
  ]

  const streamEvents: StreamEvent[] = [
    mkStreamEvent('evt_1', 'cnx_8002', 'psp.payout.status', { paymentId: 'pay_9001', status: 'settled' }, 'accepted', -20 * 60 * 1000),
    mkStreamEvent('evt_2', 'cnx_8003', 'screening.results.v1', { caseId: 'kyc_2002', result: 'potential_match' }, 'accepted', -55 * 60 * 1000),
    mkStreamEvent('evt_3', 'cnx_8004', 'analytics.refund_metrics', { batch: 'rf-2026-09-20' }, 'dead_lettered', -70 * 60 * 1000),
  ]
  streamEvents[2].error = 'Snowflake warehouse suspended (schema analytics.refund_metrics v3 mismatch)'

  const accessReviews: AccessReview[] = [
    {
      id: 'rev_9001',
      period: '2026-Q3',
      reviewer: 'usr_alice',
      startedAt: iso(-30 * DAY),
      completedAt: iso(-28 * DAY),
      decisions: [
        { userId: 'usr_frank', decision: 'retain', note: 'Support role still required.' },
        { userId: 'usr_dan', decision: 'modify', note: 'Removed dormant flag:propose grant.' },
      ],
    },
    { id: 'rev_9002', period: '2026-Q4', reviewer: 'usr_alice', startedAt: iso(-2 * DAY), decisions: [] },
  ]

  const apps: MakerApp[] = [
    {
      id: 'app_5001',
      name: 'Refund Operations Console',
      description: 'Queue, threshold approvals and payout tracking for the EU refunds desk.',
      templateId: 'tpl_refund_ops',
      owner: 'usr_bob',
      environment: 'production',
      status: 'published',
      resource: 'refunds',
      screens: [
        {
          id: 'scr_overview',
          name: 'Overview',
          components: [
            { instanceId: 'cmp_1', componentId: 'kpi_strip', props: { title: 'Refund throughput', resource: 'refunds' } },
            {
              instanceId: 'cmp_2',
              componentId: 'queue_table',
              props: { title: 'Open refunds', resource: 'refunds', columns: ['id', 'customerName', 'amount', 'status', 'riskScore'] },
            },
          ],
        },
        {
          id: 'scr_approvals',
          name: 'Approvals',
          components: [
            { instanceId: 'cmp_3', componentId: 'approval_panel', props: { title: 'Awaiting decision', resource: 'refunds' } },
            { instanceId: 'cmp_4', componentId: 'audit_trail', props: { title: 'Decision history' } },
          ],
        },
      ],
      audienceRoles: ['manager', 'processor', 'analyst'],
      connectors: ['cnx_8001', 'cnx_8002'],
      version: 4,
      createdAt: iso(-60 * DAY),
      updatedAt: iso(-3 * DAY),
      publishedAt: iso(-3 * DAY),
      sessions30d: 412,
    },
    {
      id: 'app_5002',
      name: 'KYC Review Workbench',
      description: 'Four-eyes CDD review with encrypted evidence handling.',
      templateId: 'tpl_kyc_review',
      owner: 'usr_grace',
      environment: 'production',
      status: 'published',
      resource: 'kyc',
      screens: [
        {
          id: 'scr_queue',
          name: 'Case queue',
          components: [
            { instanceId: 'cmp_5', componentId: 'kpi_strip', props: { title: 'Case load', resource: 'kyc' } },
            {
              instanceId: 'cmp_6',
              componentId: 'queue_table',
              props: { title: 'Cases', resource: 'kyc', columns: ['id', 'customerName', 'riskRating', 'status', 'slaDueAt'] },
            },
          ],
        },
        {
          id: 'scr_evidence',
          name: 'Evidence',
          components: [
            { instanceId: 'cmp_7', componentId: 'document_uploader', props: { title: 'Upload CDD evidence' } },
            { instanceId: 'cmp_8', componentId: 'audit_trail', props: { title: 'Document access log' } },
          ],
        },
      ],
      audienceRoles: ['kyc_reviewer', 'kyc_approver'],
      connectors: ['cnx_8003'],
      version: 2,
      createdAt: iso(-40 * DAY),
      updatedAt: iso(-6 * DAY),
      publishedAt: iso(-6 * DAY),
      sessions30d: 188,
    },
    {
      id: 'app_5003',
      name: 'Treasury Payout Tower (draft)',
      description: 'Dual-approval payout release and reconciliation.',
      templateId: 'tpl_payout_control',
      owner: 'usr_ivan',
      environment: 'development',
      status: 'draft',
      resource: 'payments',
      screens: [
        {
          id: 'scr_release',
          name: 'Release',
          components: [
            { instanceId: 'cmp_9', componentId: 'kpi_strip', props: { title: 'Settlement status', resource: 'payments' } },
            { instanceId: 'cmp_10', componentId: 'approval_panel', props: { title: 'Payouts awaiting release', resource: 'payments' } },
          ],
        },
      ],
      audienceRoles: ['payments_operator'],
      connectors: ['cnx_8002'],
      version: 1,
      createdAt: iso(-5 * DAY),
      updatedAt: iso(-1 * DAY),
      sessions30d: 9,
    },
  ]

  const flows: Flow[] = [
    {
      id: 'flw_6001',
      name: 'High-value refund escalation',
      description: 'Refunds above $1,000 require compliance approval before payout release.',
      owner: 'usr_bob',
      environment: 'production',
      trigger: 'refund.created',
      steps: [
        { id: 'stp_1', kind: 'lookup', resource: 'refund', keyField: 'refundId', as: 'refund' },
        {
          id: 'stp_1b',
          kind: 'transform',
          assignments: [
            { field: 'amountMajor', expression: '{{amountMinor}} / 100' },
            { field: 'summary', expression: '{{refund.id}} · {{currency}} {{amountMajor}} · {{refund.entity}} · {{refund.reason}}' },
          ],
        },
        { id: 'stp_2', kind: 'condition', field: 'amountMinor', operator: 'gt', value: '100000' },
        { id: 'stp_3', kind: 'approval', approverRole: 'kyc_approver', slaHours: 8 },
        { id: 'stp_4', kind: 'action', action: 'notify', target: 'financial-crime', message: 'Refund {{refund.id}} for {{currency}} {{amountMajor}} cleared compliance approval.' },
      ],
      status: 'active',
      connectors: [],
      createdAt: iso(-25 * DAY),
      runCount: 37,
      lastRunAt: iso(-2 * 60 * 60 * 1000),
    },
    {
      id: 'flw_6002',
      name: 'Sanctions hit containment',
      description: 'A screening hit on an accepted stream event escalates the case and freezes the refund flag.',
      owner: 'usr_grace',
      environment: 'production',
      trigger: 'stream.event_accepted',
      steps: [
        { id: 'stp_5', kind: 'condition', field: 'topic', operator: 'contains', value: 'screening' },
        { id: 'stp_6', kind: 'lookup', resource: 'kyc_case', keyField: 'payload.caseId', as: 'case' },
        { id: 'stp_7', kind: 'condition', field: 'payload.sanctions', operator: 'eq', value: 'potential_match' },
        { id: 'stp_8', kind: 'action', action: 'escalate_case', target: 'auto', message: 'Screening hit ({{payload.provider}} score {{payload.score}}) received from Kafka feed.' },
        { id: 'stp_9', kind: 'action', action: 'notify', target: 'mlro', message: 'Potential sanctions match on {{case.id}} ({{case.riskRating}} risk, {{case.country}}) requires MLRO review.' },
      ],
      status: 'active',
      connectors: ['cnx_8003'],
      createdAt: iso(-18 * DAY),
      runCount: 12,
      lastRunAt: iso(-55 * 60 * 1000),
    },
    {
      id: 'flw_6003',
      name: 'Settlement reconciliation reminder',
      description: 'Daily nudge for settled payouts that have not been reconciled.',
      owner: 'usr_ivan',
      environment: 'production',
      trigger: 'schedule.daily',
      steps: [
        { id: 'stp_10', kind: 'action', action: 'create_task', target: 'treasury', message: 'Reconcile settled payouts against PSP statement for {{date}} ({{openRefunds}} refunds open).' },
      ],
      status: 'paused',
      connectors: ['cnx_8002'],
      createdAt: iso(-10 * DAY),
      runCount: 6,
    },
  ]

  const dlpPolicies: DlpPolicy[] = [
    {
      id: 'dlp_prod',
      name: 'Production data boundary',
      environment: 'production',
      businessConnectors: ['cnx_8001', 'cnx_8002', 'cnx_8003', 'cnx_8005', 'sys_core', 'sys_psp', 'sys_kyc', 'sys_warehouse', 'sys_docs'],
      nonBusinessConnectors: ['cnx_8004', 'sys_crm', 'sys_tickets'],
      blockedConnectors: [],
    },
    {
      id: 'dlp_dev',
      name: 'Sandbox boundary',
      environment: 'development',
      businessConnectors: ['cnx_8001', 'sys_warehouse', 'sys_psp', 'sys_docs'],
      nonBusinessConnectors: ['cnx_8004', 'sys_crm', 'sys_tickets'],
      blockedConnectors: ['cnx_8005', 'sys_core', 'sys_kyc'],
    },
  ]

  return {
    users,
    refunds,
    instruments,
    payments,
    ledger,
    kycCases,
    documents,
    downloadGrants: [],
    flags,
    changeRequests,
    experiments,
    views,
    connectors,
    streamEvents,
    auditEvents: [],
    accessReviews,
    apps,
    flows,
    flowRuns: [],
    flowTasks: [],
    dlpPolicies,
    idempotency: new Map(),
    subscribers: new Set(),
  }
}

function mkUser(id: string, name: string, email: string, roles: User['roles'], department: string, scope: string): User {
  return { id, name, email, roles, department, scope, mfaEnrolled: true, lastAccessReviewAt: iso(-30 * DAY), status: 'active' }
}

function mkInstrument(id: string, customerId: string, brand: PaymentInstrument['brand'], last4: string, country: string): PaymentInstrument {
  return {
    id,
    customerId,
    token: `tok_${sha256(id).slice(0, 24)}`,
    brand,
    last4,
    expMonth: brand === 'sepa' || brand === 'ach' ? undefined : 11,
    expYear: brand === 'sepa' || brand === 'ach' ? undefined : 2029,
    country,
    createdAt: iso(-200 * DAY),
  }
}

function mkRefund(
  id: string,
  customerId: string,
  customerName: string,
  customerEmail: string,
  amountMinor: number,
  currency: string,
  reason: string,
  status: Refund['status'],
  priority: Refund['priority'],
  instrumentId: string,
  entity: string,
  requestedOffset: number,
): Refund {
  const tier = amountMinor <= 10_000 ? 0 : amountMinor <= 100_000 ? 1 : amountMinor <= 500_000 ? 2 : 3
  return {
    id,
    customerId,
    customerName,
    customerEmail,
    amountMinor,
    currency,
    reason,
    status,
    priority,
    requestedBy: 'usr_dan',
    requestedAt: iso(requestedOffset),
    entity,
    instrumentId,
    approvals: [],
    requiredApprovals: tier,
    sanctionsCleared: true,
    regEDeadline: iso(requestedOffset + 10 * DAY),
  }
}

function mkLedger(id: string, paymentId: string, account: LedgerEntry['account'], direction: LedgerEntry['direction'], amountMinor: number, currency: string, memo: string): LedgerEntry {
  return { id, paymentId, at: iso(-8 * DAY), account, direction, amountMinor, currency, memo }
}

function mkCase(id: string, customerId: string, customerName: string, customerEmail: string, country: string, riskRating: KycCase['riskRating'], status: KycCase['status'], slaDaysRemaining: number): KycCase {
  const refreshMonths = riskRating === 'high' ? 12 : riskRating === 'medium' ? 24 : 36
  return {
    id,
    customerId,
    customerName,
    customerEmail,
    dateOfBirth: '1988-04-17',
    country,
    riskRating,
    status,
    openedAt: iso(-5 * DAY),
    slaDueAt: iso(slaDaysRemaining * DAY),
    assignedTo: 'usr_grace',
    sanctionsScreening: { result: 'clear', provider: 'Dow Jones Risk & Compliance', at: iso(-4 * DAY) },
    pepScreening: { result: 'clear', provider: 'Dow Jones Risk & Compliance', at: iso(-4 * DAY) },
    entity: country === 'US' ? 'us-entity' : 'eu-entity',
    nextReviewDue: iso(refreshMonths * 30 * DAY),
    retentionUntil: years(5),
  }
}

function mkDocument(id: string, caseId: string, kind: KycDocument['kind'], filename: string, uploadedBy: string, status: KycDocument['status']): KycDocument {
  const bytes = Buffer.from(`Demo ${kind} for case ${caseId}. Contains simulated personal data.`)
  return {
    id,
    caseId,
    kind,
    filename,
    contentType: 'application/pdf',
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
    uploadedBy,
    uploadedAt: iso(-4 * DAY),
    verifiedBy: status === 'verified' ? 'usr_grace' : undefined,
    verifiedAt: status === 'verified' ? iso(-3 * DAY) : undefined,
    status,
    cipher: encryptDocument(bytes),
    residency: 'eu-central-1',
    retentionUntil: years(5),
    legalHold: false,
    downloadCount: 0,
  }
}

function mkFlag(
  id: string,
  key: string,
  name: string,
  description: string,
  category: FeatureFlag['category'],
  riskTier: FeatureFlag['riskTier'],
  owner: string,
  envs: Record<string, [boolean, number]>,
): FeatureFlag {
  const build = (env: string) => ({
    enabled: envs[env][0],
    rolloutPercent: envs[env][1],
    updatedAt: iso(-3 * DAY),
    updatedBy: owner,
  })
  return {
    id,
    key,
    name,
    description,
    category,
    owner,
    riskTier,
    environments: { development: build('development'), staging: build('staging'), production: build('production') },
    killed: false,
  }
}

function mkConnector(
  id: string,
  name: string,
  kind: StreamConnector['kind'],
  direction: StreamConnector['direction'],
  topic: string,
  status: StreamConnector['status'],
  secretRef: string,
  eventsToday: number,
  dlqDepth: number,
  piiFields: string[],
): StreamConnector {
  return {
    id,
    name,
    kind,
    direction,
    topic,
    status,
    secretRef,
    signatureAlgorithm: kind === 'webhook' ? 'hmac-sha256' : 'none',
    lastEventAt: iso(-15 * 60 * 1000),
    eventsToday,
    dlqDepth,
    schemaVersion: 'v2.1.0',
    piiFields,
  }
}

function mkStreamEvent(id: string, connectorId: string, topic: string, payload: Record<string, unknown>, status: StreamEvent['status'], offset: number): StreamEvent {
  return { id, connectorId, topic, receivedAt: iso(offset), payload, signatureValid: true, status }
}

const globalStore = globalThis as unknown as { __northwindDb?: Database }

export function db(): Database {
  if (!globalStore.__northwindDb) globalStore.__northwindDb = seed()
  return globalStore.__northwindDb
}

export function resetDb(): Database {
  globalStore.__northwindDb = seed()
  return globalStore.__northwindDb
}

export function timestamp(): string {
  return now().toISOString()
}
