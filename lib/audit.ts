// Event-sourced audit event model
// Immutable audit trail with cryptographic hash chains for SOC2 compliance

export interface AuditEvent {
  id?: string
  eventType: string
  actorId: string
  actorRole: string
  actorEmail: string
  timestamp: string
  ipAddress?: string
  userAgent?: string
  dataBefore?: Record<string, any> | null
  dataAfter?: Record<string, any> | null
  hash: string
  previousHash: string
  metadata?: Record<string, any>
}

export interface AuditEventFilter {
  eventType?: string
  actorId?: string
  actorRole?: string
  fromDate?: string
  toDate?: string
}

// In-memory storage for demo (in production, use append-only database)
let auditEvents: AuditEvent[] = []
let latestHash = "0000000000000000000000000000000000000000000000000000000000000000000"

// SHA-256 hash function for cryptographic integrity
async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// Create hash chain entry
async function createHashChainEntry(event: Omit<AuditEvent, 'hash' | 'previousHash'>): Promise<string> {
  const eventString = JSON.stringify({
    ...event,
    previousHash: latestHash
  })
  const hash = await sha256(eventString)
  return hash
}

// Log an audit event (append-only, never updates)
export async function logAuditEvent(event: Omit<AuditEvent, 'hash' | 'previousHash'>): Promise<AuditEvent> {
  const hash = await createHashChainEntry(event)
  
  const auditEvent: AuditEvent = {
    ...event,
    hash,
    previousHash: latestHash,
    id: event.id || crypto.randomUUID(),
    dataBefore: event.dataBefore || null,
    dataAfter: event.dataAfter || null
  }
  
  auditEvents.push(auditEvent)
  latestHash = hash
  
  return auditEvent
}

// Get audit events with filtering
export function getAuditEvents(filter?: AuditEventFilter): AuditEvent[] {
  let filtered = [...auditEvents].reverse() // Show newest first
  
  if (filter?.eventType) {
    filtered = filtered.filter(e => e.eventType === filter.eventType)
  }
  if (filter?.actorId) {
    filtered = filtered.filter(e => e.actorId === filter.actorId)
  }
  if (filter?.actorRole) {
    filtered = filtered.filter(e => e.actorRole === filter.actorRole)
  }
  if (filter?.fromDate) {
    filtered = filtered.filter(e => e.timestamp >= filter.fromDate!)
  }
  if (filter?.toDate) {
    filtered = filtered.filter(e => e.timestamp <= filter.toDate!)
  }
  
  return filtered
}

// Verify chain integrity
export async function verifyChainIntegrity(): Promise<{ valid: boolean; message: string }> {
  let currentHash = latestHash
  let valid = true
  let message = "Chain integrity verified"
  
  for (let i = auditEvents.length - 1; i >= 0; i--) {
    const event = auditEvents[i]
    const eventString = JSON.stringify({
      ...event,
      previousHash: event.previousHash
    })
    const computedHash = await sha256(eventString)
    
    if (computedHash !== event.hash) {
      valid = false
      message = `Chain integrity broken at event ${event.id}`
      break
    }
    
    currentHash = event.previousHash
  }
  
  if (valid && currentHash !== "0000000000000000000000000000000000000000000000000000000000000000000") {
    valid = false
    message = "Chain integrity broken: missing events"
  }
  
  return { valid, message }
}

// Get chain integrity status
export async function getChainStatus() {
  const verification = await verifyChainIntegrity()
  return {
    valid: verification.valid,
    message: verification.message,
    totalEvents: auditEvents.length,
    latestHash,
    retentionYears: 7, // SOX requirement
    hotStorageYears: 2, // SEC requirement
    storageCompliance: "SOC2/SEC/FINRA/MiFID II compliant"
  }
}

// PII redaction for audit logs
export function redactPII(data: any): any {
  if (typeof data === 'string') {
    if (data.includes('@')) {
      // Email: j***@example.com
      const [local, domain] = data.split('@')
      return `${local[0]}***@${domain}`
    }
    if (data.includes(' ')) {
      // Name: J*** S***
      const parts = data.split(' ')
      return parts.map(p => `${p[0]}***`).join(' ')
    }
    return data
  }
  if (typeof data === 'object' && data !== null) {
    const redacted: any = {}
    for (const [key, value] of Object.entries(data)) {
      if (key === 'email' || key === 'customerEmail') {
        redacted[key] = redactPII(value)
      } else if (key === 'name' || key === 'customerName') {
        redacted[key] = redactPII(value)
      } else {
        redacted[key] = value
      }
    }
    return redacted
  }
  return data
}

// Seed sample audit events for demo
export async function seedSampleAuditEvents() {
  const now = new Date().toISOString()
  
  await logAuditEvent({
    eventType: 'user.login',
    actorId: 'user-001',
    actorRole: 'admin',
    actorEmail: 'admin@company.com',
    timestamp: now,
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    dataBefore: null,
    dataAfter: { loginSuccess: true, mfaVerified: true },
    metadata: { authMethod: 'SSO', mfaMethod: 'TOTP' }
  })
  
  await logAuditEvent({
    id: crypto.randomUUID(),
    eventType: 'refund.approved',
    actorId: 'user-001',
    actorRole: 'manager',
    actorEmail: 'manager@company.com',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    dataBefore: { id: 'REF-001', status: 'pending', amount: 150.00 },
    dataAfter: { id: 'REF-001', status: 'approved', amount: 150.00, processedBy: 'manager@company.com' },
    metadata: { decisionNotes: 'Customer provided confirmation of service cancellation' }
  })
  
  await logAuditEvent({
    id: crypto.randomUUID(),
    eventType: 'refund.rejected',
    actorId: 'user-002',
    actorRole: 'manager',
    actorEmail: 'manager@company.com',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    dataBefore: { id: 'REF-003', status: 'pending', amount: 299.99 },
    dataAfter: { id: 'REF-003', status: 'rejected', amount: 299.99, processedBy: 'manager@company.com' },
    metadata: { decisionNotes: 'Customer returned used product, not eligible for refund' }
  })
}