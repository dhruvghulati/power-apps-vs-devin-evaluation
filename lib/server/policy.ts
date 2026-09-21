import type { Permission, RoleDefinition, RoleId, User } from './types'

export const roles: Record<RoleId, RoleDefinition> = {
  admin: {
    id: 'admin',
    name: 'Platform Administrator',
    description: 'Manages users, roles and connectors. Cannot approve money movement or KYC decisions.',
    priority: 100,
    permissions: [
      'admin:users',
      'admin:roles',
      'access_review:perform',
      'audit:read',
      'audit:export',
      'compliance:read',
      'stream:read',
      'stream:manage',
      'stream:replay',
      'flag:read',
      'experiment:read',
      'view:manage',
      'refund:read',
      'kyc:read',
      'payment:read',
      'app:read',
      'app:build',
      'app:publish',
      'flow:read',
      'flow:build',
      'flow:publish',
      'platform:govern',
    ],
  },
  manager: {
    id: 'manager',
    name: 'Operations Manager',
    description: 'Approves refunds within threshold, reviews operational queues and acts as change approver for feature-flag rollouts.',
    priority: 60,
    permissions: [
      'refund:read',
      'refund:write',
      'refund:approve',
      'refund:reject',
      'payment:read',
      'payment:approve',
      'kyc:read',
      'flag:read',
      'flag:propose',
      'flag:approve',
      'flag:kill',
      'experiment:read',
      'audit:read',
      'compliance:read',
      'view:manage',
      'view:share',
      'stream:read',
      'app:read',
      'app:build',
      'app:publish',
      'flow:read',
      'flow:build',
      'flow:publish',
    ],
  },
  analyst: {
    id: 'analyst',
    name: 'Operations Analyst',
    description: 'Read and export operational data. No approval rights.',
    priority: 30,
    permissions: [
      'refund:read',
      'refund:export',
      'payment:read',
      'kyc:read',
      'kyc:export',
      'flag:read',
      'experiment:read',
      'audit:read',
      'compliance:read',
      'view:manage',
      'stream:read',
      'app:read',
      'app:build',
      'flow:read',
      'flow:build',
    ],
  },
  processor: {
    id: 'processor',
    name: 'Refund Processor',
    description: 'Raises refunds and initiates payouts. Never approves its own work.',
    priority: 25,
    permissions: [
      'refund:read',
      'refund:write',
      'payment:read',
      'payment:initiate',
      'payment:execute',
      'kyc:read',
      'flag:read',
      'view:manage',
      'app:read',
      'flow:read',
    ],
  },
  auditor: {
    id: 'auditor',
    name: 'Internal Auditor',
    description: 'Independent read-only access including unmasked PII for investigations.',
    priority: 20,
    permissions: [
      'audit:read',
      'audit:export',
      'audit:pii_view',
      'compliance:read',
      'refund:read',
      'payment:read',
      'kyc:read',
      'flag:read',
      'experiment:read',
      'stream:read',
      'view:manage',
      'privacy:dsar',
      'app:read',
      'flow:read',
      'platform:govern',
    ],
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer',
    description: 'Masked read-only access with no export.',
    priority: 10,
    permissions: ['refund:read', 'kyc:read', 'flag:read', 'compliance:read', 'view:manage', 'app:read'],
  },
  kyc_reviewer: {
    id: 'kyc_reviewer',
    name: 'KYC Reviewer',
    description: 'Performs CDD checks, uploads and verifies documents, recommends a decision.',
    priority: 35,
    permissions: [
      'kyc:read',
      'kyc:write',
      'kyc:escalate',
      'kyc:document_upload',
      'kyc:document_download',
      'view:manage',
      'audit:read',
      'app:read',
      'app:build',
      'flow:read',
      'flow:build',
    ],
  },
  kyc_approver: {
    id: 'kyc_approver',
    name: 'MLRO / KYC Approver',
    description: 'Final KYC decision authority and compliance sign-off for regulated experiments. Cannot review the file it approves.',
    priority: 65,
    permissions: [
      'kyc:read',
      'kyc:decide',
      'kyc:escalate',
      'kyc:document_download',
      'kyc:export',
      'compliance:read',
      'refund:read',
      'refund:approve',
      'payment:read',
      'experiment:read',
      'experiment:approve',
      'flag:read',
      'audit:read',
      'view:manage',
      'privacy:dsar',
      'privacy:erase',
      'app:read',
      'app:publish',
      'flow:read',
      'flow:publish',
    ],
  },
  payments_operator: {
    id: 'payments_operator',
    name: 'Payments Operator',
    description: 'Executes approved payouts and performs reconciliation.',
    priority: 40,
    permissions: [
      'payment:read',
      'payment:initiate',
      'payment:execute',
      'payment:instrument_reveal',
      'refund:read',
      'view:manage',
      'audit:read',
      'stream:read',
      'app:read',
      'flow:read',
      'flow:build',
    ],
  },
  experiment_owner: {
    id: 'experiment_owner',
    name: 'Experiment Owner',
    description: 'Proposes flag changes and runs experiments. Cannot self-approve production changes.',
    priority: 30,
    permissions: [
      'flag:read',
      'flag:propose',
      'flag:kill',
      'experiment:read',
      'experiment:write',
      'view:manage',
      'audit:read',
      'stream:read',
      'app:read',
      'app:build',
      'flow:read',
      'flow:build',
    ],
  },
  director: {
    id: 'director',
    name: 'Director (Executive Approver)',
    description: 'Final approval slot for high-value refunds and payouts. Read-only everywhere else.',
    priority: 70,
    permissions: [
      'refund:read',
      'refund:approve',
      'refund:reject',
      'payment:read',
      'payment:approve',
      'kyc:read',
      'flag:read',
      'experiment:read',
      'audit:read',
      'compliance:read',
      'view:manage',
      'app:read',
      'flow:read',
      'platform:govern',
    ],
  },
}

/**
 * Preventive SoD. Pairs listed here can never be held by the same identity;
 * provisioning is blocked rather than flagged in a quarterly review.
 */
export const sodConflicts: { a: RoleId; b: RoleId; reason: string }[] = [
  { a: 'manager', b: 'processor', reason: 'One identity cannot both raise and approve a refund (maker-checker).' },
  { a: 'processor', b: 'auditor', reason: 'A processor cannot audit their own processing activity.' },
  { a: 'manager', b: 'auditor', reason: 'Approvers cannot sit in the independent audit function.' },
  { a: 'kyc_reviewer', b: 'kyc_approver', reason: 'Four-eyes: the reviewer of a KYC file cannot be its approver.' },
  { a: 'payments_operator', b: 'manager', reason: 'Payout execution must be separate from payout approval.' },
  { a: 'experiment_owner', b: 'manager', reason: 'Experiment owners cannot approve their own production rollouts.' },
  { a: 'admin', b: 'manager', reason: 'Privileged access administration is separated from business approvals.' },
  { a: 'admin', b: 'payments_operator', reason: 'Identity administration is separated from money movement.' },
  { a: 'director', b: 'processor', reason: 'Executive approvers cannot raise the refunds they sign off.' },
  { a: 'director', b: 'payments_operator', reason: 'Executive approval must be separate from payout execution.' },
  { a: 'director', b: 'auditor', reason: 'Executive approvers cannot sit in the independent audit function.' },
]

export function findSoDConflict(existing: RoleId[], candidate: RoleId) {
  for (const held of existing) {
    if (held === candidate) continue
    const match = sodConflicts.find(
      (c) => (c.a === held && c.b === candidate) || (c.b === held && c.a === candidate),
    )
    if (match) return { conflictWith: held, reason: match.reason }
  }
  return null
}

export function permissionsFor(user: Pick<User, 'roles'>): Permission[] {
  const set = new Set<Permission>()
  for (const role of user.roles) {
    for (const permission of roles[role]?.permissions ?? []) set.add(permission)
  }
  return [...set]
}

export function hasPermission(user: Pick<User, 'roles'>, permission: Permission): boolean {
  return user.roles.some((role) => roles[role]?.permissions.includes(permission))
}

export interface PolicyContext {
  /** Identity that created the record under review, for maker-checker checks. */
  initiatorId?: string
  /** Identities that already signed off, for multi-approver checks. */
  existingApprovers?: string[]
  /** Roles that already signed off, for role-tiered approval chains. */
  approvedRoles?: RoleId[]
  amountMinor?: number
  entity?: string
  environment?: string
  riskTier?: 'standard' | 'regulated'
}

export interface PolicyDecision {
  allow: boolean
  reason: string
  obligations: string[]
}

/** Each approval slot must be filled by a distinct identity holding one of the listed roles. */
const APPROVAL_TIERS: { maxMinor: number; slots: RoleId[][]; label: string }[] = [
  { maxMinor: 10_000, slots: [], label: 'auto-approved under $100' },
  { maxMinor: 100_000, slots: [['manager']], label: 'manager approval required $100–$1,000' },
  { maxMinor: 500_000, slots: [['manager'], ['kyc_approver']], label: 'manager + compliance approval required $1,000–$5,000' },
  {
    maxMinor: Number.MAX_SAFE_INTEGER,
    slots: [['manager'], ['kyc_approver'], ['director']],
    label: 'manager + compliance + director approval above $5,000',
  },
]

export function requiredApprovals(amountMinor: number) {
  const tier = APPROVAL_TIERS.find((t) => amountMinor <= t.maxMinor) ?? APPROVAL_TIERS[APPROVAL_TIERS.length - 1]
  return { ...tier, approvals: tier.slots.length }
}

/** Approval slots not yet filled by the roles that have already signed off. */
export function outstandingApprovalSlots(amountMinor: number, approvedRoles: RoleId[]): RoleId[][] {
  const remaining = [...approvedRoles]
  return requiredApprovals(amountMinor).slots.filter((slot) => {
    const index = remaining.findIndex((role) => slot.includes(role))
    if (index === -1) return true
    remaining.splice(index, 1)
    return false
  })
}

/**
 * Single decision point for every mutating call. Combines RBAC (does the role
 * carry the permission) with ABAC (scope, maker-checker, thresholds) so the API
 * layer never re-implements policy.
 */
export function evaluate(user: User, permission: Permission, ctx: PolicyContext = {}): PolicyDecision {
  const obligations: string[] = []

  if (user.status !== 'active') {
    return { allow: false, reason: `Account ${user.id} is suspended.`, obligations }
  }
  if (!hasPermission(user, permission)) {
    return {
      allow: false,
      reason: `Role(s) ${user.roles.join(', ')} do not carry permission ${permission}.`,
      obligations,
    }
  }
  if (ctx.entity && user.scope !== '*' && user.scope !== ctx.entity) {
    return {
      allow: false,
      reason: `Data scope ${user.scope} does not cover entity ${ctx.entity}.`,
      obligations,
    }
  }
  if (!user.mfaEnrolled && SENSITIVE_PERMISSIONS.has(permission)) {
    return { allow: false, reason: `${permission} requires an MFA-enrolled identity.`, obligations }
  }

  const isApproval = permission.endsWith(':approve') || permission === 'kyc:decide'
  if (isApproval && ctx.initiatorId && ctx.initiatorId === user.id) {
    return {
      allow: false,
      reason: 'Maker-checker: the identity that raised this item cannot approve it.',
      obligations,
    }
  }
  if (isApproval && ctx.existingApprovers?.includes(user.id)) {
    return { allow: false, reason: 'This identity has already signed off on this item.', obligations }
  }
  if (permission === 'refund:approve' && ctx.amountMinor !== undefined && ctx.approvedRoles) {
    const outstanding = outstandingApprovalSlots(ctx.amountMinor, ctx.approvedRoles)
    if (outstanding.length === 0) {
      return { allow: false, reason: 'All required approvals for this amount are already recorded.', obligations }
    }
    if (!outstanding.some((slot) => slot.some((role) => user.roles.includes(role)))) {
      const needed = outstanding.map((slot) => slot.map((role) => roles[role].name).join(' or ')).join(', then ')
      return { allow: false, reason: `Outstanding approvals for this amount must come from: ${needed}.`, obligations }
    }
  }

  if (permission === 'flag:approve' && ctx.environment === 'production') {
    obligations.push('Production rollout recorded as a change-management event.')
    if (ctx.riskTier === 'regulated') obligations.push('Regulated surface: compliance sign-off captured.')
  }
  if (permission === 'payment:execute') {
    obligations.push('Sanctions and velocity screening re-run immediately before submission.')
  }
  if (permission === 'kyc:document_download') {
    obligations.push('Download issued as a single-use, 5-minute grant and logged against the case.')
  }
  if (ctx.amountMinor !== undefined) {
    obligations.push(`Threshold policy: ${requiredApprovals(ctx.amountMinor).label}.`)
  }

  return { allow: true, reason: 'Permitted by policy.', obligations }
}

const SENSITIVE_PERMISSIONS = new Set<Permission>([
  'payment:approve',
  'payment:execute',
  'payment:instrument_reveal',
  'kyc:decide',
  'kyc:document_download',
  'admin:roles',
  'privacy:erase',
  'audit:pii_view',
])
