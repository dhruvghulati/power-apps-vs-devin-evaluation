import type { Permission } from './types'

/**
 * Synthetic catalogue of the systems a fintech's internal tools connect to.
 * Every entity carries a data classification and per-field PII markers so the
 * maker studio can enforce DLP and masking at bind time, not after an incident.
 */

export type FieldType = 'string' | 'number' | 'money' | 'date' | 'datetime' | 'boolean' | 'enum' | 'id'
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted'

export interface FieldDefinition {
  name: string
  type: FieldType
  pii: boolean
  description: string
  values?: string[]
}

export interface EntityDefinition {
  id: string
  name: string
  description: string
  classification: Classification
  primaryKey: string
  fields: FieldDefinition[]
  /** Governed in-app permission required before this entity can be bound. */
  requiredPermission: Permission
  sampleSize: number
}

export interface DataSystem {
  id: string
  name: string
  vendor: string
  kind: 'core_banking' | 'psp' | 'kyc_vendor' | 'warehouse' | 'crm' | 'document_store' | 'ledger' | 'ticketing'
  protocol: 'postgres' | 'rest' | 'webhook' | 'snowflake' | 'graph' | 'sftp' | 'kafka'
  auth: 'oauth2' | 'mtls' | 'hmac' | 'service_account' | 'vault_credential'
  residency: string
  businessData: boolean
  status: 'connected' | 'degraded' | 'disconnected'
  latencyMs: number
  refresh: 'realtime' | 'cdc' | 'hourly' | 'daily'
  owner: string
  entities: EntityDefinition[]
}

const first = ['Amara', 'Ben', 'Chloe', 'Dev', 'Elena', 'Farid', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Kaia', 'Luca', 'Maya', 'Noor', 'Oscar', 'Priya']
const last = ['Okafor', 'Schmidt', 'Rossi', 'Patel', 'Novak', 'Haddad', 'Lindqvist', 'Moreau', 'Silva', 'Becker', 'Tanaka', 'Fischer', 'Kowalski', 'Ahmed', 'Dubois', 'Nair']
const merchants = ['Northwind Travel', 'Helios Energy', 'Bluebird Retail', 'Cobalt Software', 'Meridian Health', 'Sable Foods', 'Orbit Mobility', 'Quill Media']
const countries = ['DE', 'FR', 'NL', 'ES', 'IT', 'GB', 'US', 'IE', 'SE', 'PL']

/** Deterministic pseudo-random so demos are stable across reloads. */
function rng(seed: string) {
  let h = 2166136261
  for (const char of seed) h = Math.imul(h ^ char.charCodeAt(0), 16777619)
  return () => {
    h += h << 13
    h ^= h >>> 7
    h += h << 3
    h ^= h >>> 17
    h += h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)]
}

/** Anchored to the start of the current hour so repeated reads within a session return identical rows. */
function isoDaysAgo(random: () => number, maxDays: number): string {
  const anchor = Math.floor(Date.now() / 3_600_000) * 3_600_000
  return new Date(anchor - Math.floor(random() * maxDays * 24 * 60) * 60_000).toISOString()
}

function person(random: () => number) {
  const name = `${pick(random, first)} ${pick(random, last)}`
  return { name, email: `${name.toLowerCase().replace(' ', '.')}@example.com` }
}

export function sampleRows(system: DataSystem, entity: EntityDefinition, limit = entity.sampleSize): Record<string, unknown>[] {
  const random = rng(`${system.id}:${entity.id}`)
  return Array.from({ length: limit }, (_, index) => {
    const row: Record<string, unknown> = {}
    const who = person(random)
    for (const field of entity.fields) {
      switch (field.type) {
        case 'id':
          row[field.name] = `${entity.id.slice(0, 3)}_${(index + 1).toString().padStart(5, '0')}`
          break
        case 'string':
          row[field.name] = /name/i.test(field.name) ? (/merchant|counterparty/i.test(field.name) ? pick(random, merchants) : who.name) : /email/i.test(field.name) ? who.email : /iban/i.test(field.name) ? `DE89 3704 0044 05${Math.floor(random() * 90 + 10)} 3000 ${Math.floor(random() * 90 + 10)}` : /country/i.test(field.name) ? pick(random, countries) : `${field.name}-${index + 1}`
          break
        case 'number':
          row[field.name] = Math.round(random() * 1000)
          break
        case 'money':
          row[field.name] = Math.round(random() * 250_000) / 100
          break
        case 'date':
          row[field.name] = isoDaysAgo(random, 365).slice(0, 10)
          break
        case 'datetime':
          row[field.name] = isoDaysAgo(random, 30)
          break
        case 'boolean':
          row[field.name] = random() > 0.5
          break
        case 'enum':
          row[field.name] = pick(random, field.values ?? ['a', 'b'])
          break
      }
    }
    return row
  })
}

const entity = (
  id: string,
  name: string,
  description: string,
  classification: Classification,
  requiredPermission: Permission,
  fields: FieldDefinition[],
  sampleSize = 12,
): EntityDefinition => ({ id, name, description, classification, primaryKey: fields[0].name, fields, requiredPermission, sampleSize })

const f = (name: string, type: FieldType, description: string, pii = false, values?: string[]): FieldDefinition => ({ name, type, pii, description, values })

export const dataSystems: DataSystem[] = [
  {
    id: 'sys_core',
    name: 'Core banking ledger',
    vendor: 'Thought Machine Vault (synthetic)',
    kind: 'core_banking',
    protocol: 'postgres',
    auth: 'mtls',
    residency: 'eu-central-1',
    businessData: true,
    status: 'connected',
    latencyMs: 18,
    refresh: 'cdc',
    owner: 'platform-data@northwind.example',
    entities: [
      entity('accounts', 'Accounts', 'Customer current and wallet accounts.', 'restricted', 'refund:read', [
        f('account_id', 'id', 'Stable account identifier'),
        f('customer_name', 'string', 'Legal name on the account', true),
        f('iban', 'string', 'IBAN', true),
        f('country', 'string', 'Country of residence'),
        f('balance', 'money', 'Available balance'),
        f('status', 'enum', 'Account status', false, ['active', 'frozen', 'closed']),
        f('opened_at', 'date', 'Opening date'),
      ]),
      entity('postings', 'Ledger postings', 'Double-entry postings by account.', 'confidential', 'payment:read', [
        f('posting_id', 'id', 'Posting id'),
        f('account_id', 'string', 'Account reference'),
        f('direction', 'enum', 'Debit or credit', false, ['debit', 'credit']),
        f('amount', 'money', 'Amount'),
        f('currency', 'enum', 'ISO currency', false, ['EUR', 'GBP', 'USD']),
        f('posted_at', 'datetime', 'Posting time'),
        f('reconciled', 'boolean', 'Matched to statement'),
      ], 16),
    ],
  },
  {
    id: 'sys_psp',
    name: 'Payment service provider',
    vendor: 'Adyen-style API (synthetic)',
    kind: 'psp',
    protocol: 'webhook',
    auth: 'hmac',
    residency: 'eu-west-1',
    businessData: true,
    status: 'connected',
    latencyMs: 210,
    refresh: 'realtime',
    owner: 'payments-eng@northwind.example',
    entities: [
      entity('payouts', 'Payouts', 'Outbound payouts and their PSP status.', 'confidential', 'payment:read', [
        f('psp_reference', 'id', 'PSP reference'),
        f('merchant_name', 'string', 'Merchant account'),
        f('amount', 'money', 'Payout amount'),
        f('status', 'enum', 'PSP lifecycle status', false, ['received', 'authorised', 'settled', 'failed', 'refused']),
        f('scheme', 'enum', 'Rails', false, ['SEPA', 'Faster Payments', 'ACH', 'card']),
        f('settled_at', 'datetime', 'Settlement time'),
      ]),
      entity('disputes', 'Disputes & chargebacks', 'Chargeback lifecycle from the scheme.', 'confidential', 'refund:read', [
        f('dispute_id', 'id', 'Dispute id'),
        f('merchant_name', 'string', 'Merchant'),
        f('amount', 'money', 'Disputed amount'),
        f('reason_code', 'enum', 'Scheme reason code', false, ['10.4', '13.1', '4837', '4853']),
        f('stage', 'enum', 'Stage', false, ['inquiry', 'chargeback', 'pre-arbitration', 'won', 'lost']),
        f('due_at', 'date', 'Representment deadline'),
      ], 8),
    ],
  },
  {
    id: 'sys_kyc',
    name: 'KYC / screening vendor',
    vendor: 'ComplyAdvantage-style (synthetic)',
    kind: 'kyc_vendor',
    protocol: 'rest',
    auth: 'oauth2',
    residency: 'eu-central-1',
    businessData: true,
    status: 'degraded',
    latencyMs: 640,
    refresh: 'realtime',
    owner: 'fincrime@northwind.example',
    entities: [
      entity('screenings', 'Screening results', 'Sanctions, PEP and adverse-media hits.', 'restricted', 'kyc:read', [
        f('screening_id', 'id', 'Screening id'),
        f('subject_name', 'string', 'Screened subject', true),
        f('country', 'string', 'Nationality'),
        f('sanctions', 'enum', 'Sanctions result', false, ['clear', 'potential_match', 'hit']),
        f('pep', 'enum', 'PEP result', false, ['clear', 'match']),
        f('adverse_media', 'boolean', 'Adverse media found'),
        f('screened_at', 'datetime', 'Screening time'),
      ]),
    ],
  },
  {
    id: 'sys_warehouse',
    name: 'Analytics warehouse',
    vendor: 'Snowflake (synthetic)',
    kind: 'warehouse',
    protocol: 'snowflake',
    auth: 'service_account',
    residency: 'eu-central-1',
    businessData: true,
    status: 'connected',
    latencyMs: 890,
    refresh: 'hourly',
    owner: 'data-platform@northwind.example',
    entities: [
      entity('refund_metrics', 'Refund metrics (daily)', 'Aggregated refund KPIs by entity.', 'internal', 'refund:read', [
        f('metric_id', 'id', 'Row id'),
        f('day', 'date', 'Metric day'),
        f('entity', 'enum', 'Legal entity', false, ['EU', 'UK', 'US']),
        f('refunds', 'number', 'Count'),
        f('approved_value', 'money', 'Approved value'),
        f('avg_decision_hours', 'number', 'Average time to decision'),
      ], 14),
      entity('experiment_readouts', 'Experiment readouts', 'Primary and guardrail metrics per experiment.', 'internal', 'experiment:read', [
        f('readout_id', 'id', 'Row id'),
        f('experiment', 'enum', 'Experiment', false, ['instant-refund-under-50', 'kyc-doc-autoverify', 'payout-batching']),
        f('variant', 'enum', 'Variant', false, ['control', 'treatment']),
        f('conversion', 'number', 'Primary metric (bps)'),
        f('complaints', 'number', 'Guardrail: complaints'),
        f('observed_at', 'date', 'Day'),
      ], 10),
    ],
  },
  {
    id: 'sys_crm',
    name: 'Customer CRM',
    vendor: 'Salesforce (synthetic)',
    kind: 'crm',
    protocol: 'rest',
    auth: 'oauth2',
    residency: 'us-east-1',
    businessData: false,
    status: 'connected',
    latencyMs: 320,
    refresh: 'hourly',
    owner: 'customer-ops@northwind.example',
    entities: [
      entity('cases', 'Support cases', 'Customer complaints and contact history.', 'confidential', 'refund:read', [
        f('case_id', 'id', 'Case id'),
        f('customer_name', 'string', 'Customer', true),
        f('customer_email', 'string', 'Email', true),
        f('channel', 'enum', 'Channel', false, ['email', 'chat', 'phone', 'ombudsman']),
        f('category', 'enum', 'Category', false, ['refund', 'kyc_delay', 'fees', 'fraud']),
        f('sla_breached', 'boolean', 'Consumer Duty SLA breached'),
        f('opened_at', 'datetime', 'Opened'),
      ]),
    ],
  },
  {
    id: 'sys_docs',
    name: 'Regulated document store',
    vendor: 'SharePoint / Blob (synthetic)',
    kind: 'document_store',
    protocol: 'graph',
    auth: 'oauth2',
    residency: 'eu-central-1',
    businessData: true,
    status: 'connected',
    latencyMs: 140,
    refresh: 'realtime',
    owner: 'records-mgmt@northwind.example',
    entities: [
      entity('retention_schedule', 'Retention schedule', 'Record classes, retention and legal hold state.', 'internal', 'compliance:read', [
        f('record_class_id', 'id', 'Record class'),
        f('record_class', 'enum', 'Class', false, ['kyc_evidence', 'transaction_record', 'decision_record', 'complaint_file']),
        f('retention_years', 'number', 'Years retained'),
        f('legal_hold', 'boolean', 'Under legal hold'),
        f('regulation', 'enum', 'Driver', false, ['AMLR', 'SEC 17a-4', 'MiFID II', 'Consumer Duty']),
        f('reviewed_at', 'date', 'Last review'),
      ], 8),
    ],
  },
  {
    id: 'sys_tickets',
    name: 'Change & incident tickets',
    vendor: 'Jira Service Management (synthetic)',
    kind: 'ticketing',
    protocol: 'rest',
    auth: 'vault_credential',
    residency: 'us-east-1',
    businessData: false,
    status: 'connected',
    latencyMs: 400,
    refresh: 'hourly',
    owner: 'sre@northwind.example',
    entities: [
      entity('changes', 'Change tickets', 'CAB-approved production changes.', 'internal', 'flag:read', [
        f('ticket_id', 'id', 'Ticket'),
        f('summary', 'string', 'Summary'),
        f('risk', 'enum', 'Risk', false, ['low', 'medium', 'high']),
        f('approved', 'boolean', 'CAB approved'),
        f('window_start', 'datetime', 'Change window'),
      ], 8),
    ],
  },
]

export function findEntity(systemId: string, entityId: string): { system: DataSystem; entity: EntityDefinition } | null {
  const system = dataSystems.find((candidate) => candidate.id === systemId)
  const found = system?.entities.find((candidate) => candidate.id === entityId)
  return system && found ? { system, entity: found } : null
}
