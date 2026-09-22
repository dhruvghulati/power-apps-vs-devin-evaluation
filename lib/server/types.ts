// Domain types for the governed fintech operations platform.
// Everything here is server-side state; clients only ever see projections.

export type RoleId =
  | 'admin'
  | 'manager'
  | 'analyst'
  | 'processor'
  | 'auditor'
  | 'viewer'
  | 'kyc_reviewer'
  | 'kyc_approver'
  | 'payments_operator'
  | 'experiment_owner'
  | 'director'

export type Permission =
  | 'refund:read'
  | 'refund:write'
  | 'refund:approve'
  | 'refund:reject'
  | 'refund:export'
  | 'payment:read'
  | 'payment:initiate'
  | 'payment:approve'
  | 'payment:execute'
  | 'payment:instrument_reveal'
  | 'kyc:read'
  | 'kyc:write'
  | 'kyc:decide'
  | 'kyc:escalate'
  | 'kyc:export'
  | 'kyc:document_upload'
  | 'kyc:document_download'
  | 'flag:read'
  | 'flag:propose'
  | 'flag:approve'
  | 'flag:kill'
  | 'experiment:read'
  | 'experiment:write'
  | 'experiment:approve'
  | 'view:manage'
  | 'view:share'
  | 'stream:read'
  | 'stream:manage'
  | 'stream:replay'
  | 'admin:users'
  | 'admin:roles'
  | 'access_review:perform'
  | 'audit:read'
  | 'audit:export'
  | 'audit:pii_view'
  | 'compliance:read'
  | 'privacy:dsar'
  | 'privacy:erase'
  | 'app:read'
  | 'app:build'
  | 'app:publish'
  | 'flow:read'
  | 'flow:build'
  | 'flow:publish'
  | 'platform:govern'

export interface RoleDefinition {
  id: RoleId
  name: string
  description: string
  priority: number
  permissions: Permission[]
}

export interface User {
  id: string
  name: string
  email: string
  roles: RoleId[]
  department: string
  /** Business unit / entity the user may act on. `*` means global. */
  scope: string
  mfaEnrolled: boolean
  lastAccessReviewAt: string
  status: 'active' | 'suspended'
}

export type RefundStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'paying'
  | 'paid'
  | 'payment_failed'

export interface RefundApproval {
  actorId: string
  actorEmail: string
  role: RoleId
  decision: 'approved' | 'rejected'
  notes: string
  at: string
}

export interface Refund {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  amountMinor: number
  currency: string
  reason: string
  status: RefundStatus
  priority: 'low' | 'medium' | 'high'
  requestedBy: string
  requestedAt: string
  entity: string
  instrumentId: string
  approvals: RefundApproval[]
  requiredApprovals: number
  paymentId?: string
  sanctionsCleared: boolean
  regEDeadline: string
}

/** Tokenized payment instrument. Raw PANs never enter this system. */
export interface PaymentInstrument {
  id: string
  customerId: string
  token: string
  brand: 'visa' | 'mastercard' | 'amex' | 'sepa' | 'ach'
  last4: string
  expMonth?: number
  expYear?: number
  country: string
  createdAt: string
}

export type PaymentStatus =
  | 'requires_approval'
  | 'authorized'
  | 'submitted'
  | 'settled'
  | 'failed'
  | 'reversed'

export interface Payment {
  id: string
  refundId: string
  idempotencyKey: string
  amountMinor: number
  currency: string
  instrumentId: string
  status: PaymentStatus
  pspReference?: string
  failureCode?: string
  initiatedBy: string
  approvedBy: string[]
  createdAt: string
  updatedAt: string
  settledAt?: string
  reconciledAt?: string
  /** Screening performed immediately before submission to the PSP. */
  screening: { sanctions: 'clear' | 'hit'; velocity: 'clear' | 'flagged'; at: string }
}

export interface LedgerEntry {
  id: string
  paymentId: string
  at: string
  account: 'refunds_payable' | 'cash_clearing' | 'customer_payouts' | 'fx_suspense'
  direction: 'debit' | 'credit'
  amountMinor: number
  currency: string
  memo: string
}

export type KycStatus =
  | 'pending_documents'
  | 'in_review'
  | 'escalated'
  | 'approved'
  | 'rejected'

export interface KycCase {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  dateOfBirth: string
  country: string
  riskRating: 'low' | 'medium' | 'high'
  status: KycStatus
  openedAt: string
  slaDueAt: string
  assignedTo?: string
  sanctionsScreening: { result: 'clear' | 'potential_match' | 'match'; provider: string; at: string }
  pepScreening: { result: 'clear' | 'potential_match'; provider: string; at: string }
  reviewedBy?: string
  decidedBy?: string
  decisionNotes?: string
  decidedAt?: string
  entity: string
  /** CDD refresh cadence derived from risk rating (AMLR EU 2024/1624). */
  nextReviewDue: string
  retentionUntil: string
}

export type DocumentKind = 'passport' | 'drivers_license' | 'proof_of_address' | 'source_of_funds' | 'selfie'

export interface KycDocument {
  id: string
  caseId: string
  kind: DocumentKind
  filename: string
  contentType: string
  sizeBytes: number
  /** SHA-256 of the plaintext bytes; proves the stored blob was not altered. */
  sha256: string
  uploadedBy: string
  uploadedAt: string
  verifiedBy?: string
  verifiedAt?: string
  status: 'uploaded' | 'verified' | 'rejected'
  rejectionReason?: string
  /** AES-256-GCM envelope. Never sent to the client. */
  cipher: { iv: string; tag: string; data: string; keyId: string }
  residency: string
  retentionUntil: string
  legalHold: boolean
  downloadCount: number
}

export interface DownloadGrant {
  token: string
  documentId: string
  userId: string
  expiresAt: string
  used: boolean
  reason: string
}

export type Environment = 'development' | 'staging' | 'production'

export interface FeatureFlag {
  id: string
  key: string
  name: string
  description: string
  category: 'product' | 'infrastructure' | 'compliance' | 'ux' | 'risk'
  owner: string
  /** Flags touching money movement or regulated flows always need a second approver. */
  riskTier: 'standard' | 'regulated'
  environments: Record<Environment, { enabled: boolean; rolloutPercent: number; updatedAt: string; updatedBy: string }>
  killed: boolean
}

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'withdrawn'

export interface FlagChangeRequest {
  id: string
  flagId: string
  environment: Environment
  proposedBy: string
  proposedAt: string
  justification: string
  ticket: string
  before: { enabled: boolean; rolloutPercent: number }
  after: { enabled: boolean; rolloutPercent: number }
  status: ChangeRequestStatus
  reviewedBy?: string
  reviewedAt?: string
  reviewNotes?: string
}

export interface Experiment {
  id: string
  name: string
  hypothesis: string
  flagId: string
  owner: string
  status: 'draft' | 'running' | 'paused' | 'concluded'
  audience: { segment: string; percent: number }
  /** Experiments on regulated surfaces need compliance sign-off before running. */
  requiresComplianceSignoff: boolean
  signedOffBy?: string
  startedAt?: string
  concludedAt?: string
  primaryMetric: string
  guardrailMetrics: string[]
}

export interface SavedView {
  id: string
  ownerId: string
  name: string
  resource: 'refunds' | 'kyc' | 'payments' | 'audit' | 'flags'
  filters: Record<string, string>
  columns: string[]
  sort?: { field: string; direction: 'asc' | 'desc' }
  isDefault: boolean
  shared: boolean
  createdAt: string
}

export interface StreamConnector {
  id: string
  name: string
  kind: 'kafka' | 'kinesis' | 'webhook' | 'postgres_cdc' | 'snowflake' | 'sftp'
  direction: 'inbound' | 'outbound'
  topic: string
  status: 'connected' | 'degraded' | 'disconnected'
  /** Only a reference is stored; secret material lives in the vault. */
  secretRef: string
  signatureAlgorithm: 'hmac-sha256' | 'none'
  lastEventAt?: string
  eventsToday: number
  dlqDepth: number
  schemaVersion: string
  piiFields: string[]
}

export interface StreamEvent {
  id: string
  connectorId: string
  topic: string
  receivedAt: string
  payload: Record<string, unknown>
  signatureValid: boolean
  status: 'accepted' | 'rejected' | 'dead_lettered' | 'replayed'
  error?: string
}

export interface AuditEvent {
  seq: number
  id: string
  eventType: string
  actorId: string
  actorEmail: string
  actorRoles: RoleId[]
  resource: string
  resourceId?: string
  outcome: 'allow' | 'deny' | 'error'
  reason?: string
  timestamp: string
  ipAddress: string
  before?: unknown
  after?: unknown
  metadata?: Record<string, unknown>
  hash: string
  previousHash: string
}

export interface AccessReview {
  id: string
  period: string
  reviewer: string
  startedAt: string
  completedAt?: string
  decisions: { userId: string; decision: 'retain' | 'revoke' | 'modify'; note: string }[]
}
