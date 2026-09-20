// SoD (Segregation of Duties) enforcement logic
// Preventive SoD: Block conflicts at provisioning time
// Continuous monitoring: Detect violations in real-time

import { Role, checkSoDConflict, getUserPermissions } from './rbac'
import { logAuditEvent } from './audit'

export interface SoDViolation {
  id?: string
  userId: string
  existingRoles: Role[]
  attemptedRole: Role
  conflictWith: Role
  reason: string
  timestamp: string
  detectedBy: 'preventive' | 'continuous'
  status: 'blocked' | 'detected' | 'mitigated'
  metadata?: Record<string, any>
}

export interface SoDStatus {
  monitoringActive: boolean
  lastCheck: string
  violations: SoDViolation[]
  totalUsers: number
  usersWithConflicts: number
}

// In-memory storage for SoD violations
let sodViolations: SoDViolation[] = []
let sodMonitoringActive = true
let lastSodCheck = new Date().toISOString()

// Attempt to assign a role with SoD check
export function assignRoleWithSoDCheck(
  userId: string,
  existingRoles: Role[],
  newRole: Role
): { success: boolean; reason?: string; violation?: SoDViolation } {
  const conflictCheck = checkSoDConflict(existingRoles, newRole)
  
  if (conflictCheck.hasConflict) {
    // Preventive SoD: Block the assignment
    const violation: SoDViolation = {
      userId,
      existingRoles,
      attemptedRole: newRole,
      conflictWith: conflictCheck.conflictWith!,
      reason: conflictCheck.reason!,
      timestamp: new Date().toISOString(),
      detectedBy: 'preventive',
      status: 'blocked'
    }
    
    sodViolations.push(violation)
    
    // Log the blocked attempt
    logAuditEvent({
      id: crypto.randomUUID(),
      eventType: 'sod.blocked',
      actorId: userId,
      actorRole: existingRoles[0] || 'viewer',
      actorEmail: `user-${userId}@company.com`,
      timestamp: new Date().toISOString(),
      dataBefore: { existingRoles, attemptedRole: newRole },
      dataAfter: { status: 'blocked', reason: conflictCheck.reason },
      metadata: { conflictWith: conflictCheck.conflictWith }
    })
    
    return {
      success: false,
      reason: conflictCheck.reason,
      violation
    }
  }
  
  // No conflict, allow assignment
  logAuditEvent({
    id: crypto.randomUUID(),
    eventType: 'role.assigned',
    actorId: userId,
    actorRole: existingRoles[0] || 'viewer',
    actorEmail: `user-${userId}@company.com`,
    timestamp: new Date().toISOString(),
    dataBefore: { existingRoles },
    dataAfter: { existingRoles: [...existingRoles, newRole] },
    metadata: { newRole }
  })
  
  return { success: true }
}

// Continuous SoD monitoring check
export function continuousSoDCheck(): SoDStatus {
  lastSodCheck = new Date().toISOString()
  
  // In a real system, this would scan all users and their role assignments
  // For demo, we just return the current state
  const usersWithConflicts = new Set(
    sodViolations
      .filter(v => v.status === 'detected')
      .map(v => v.userId)
  )
  
  return {
    monitoringActive: sodMonitoringActive,
    lastCheck: lastSodCheck,
    violations: sodViolations,
    totalUsers: 6, // Mock user count
    usersWithConflicts: usersWithConflicts.size
  }
}

// Get SoD status for a specific user
export function getUserSoDStatus(userId: string): {
  hasViolations: boolean
  violations: SoDViolation[]
  incompatibleRoles: Role[]
} {
  const userViolations = sodViolations.filter(v => v.userId === userId)
  const incompatibleRoles = new Set<Role>()
  
  userViolations.forEach(v => {
    incompatibleRoles.add(v.conflictWith)
    incompatibleRoles.add(v.attemptedRole)
  })
  
  return {
    hasViolations: userViolations.length > 0,
    violations: userViolations,
    incompatibleRoles: Array.from(incompatibleRoles)
  }
}

// Resolve an SoD violation (with mitigation)
export function resolveSoDViolation(violationId: string, mitigation: string): boolean {
  const violationIndex = sodViolations.findIndex(v => v.id === violationId)
  if (violationIndex === -1) return false
  
  sodViolations[violationIndex].status = 'mitigated'
  sodViolations[violationIndex].metadata = { ...sodViolations[violationIndex].metadata, mitigation }
  
  logAuditEvent({
    id: crypto.randomUUID(),
    eventType: 'sod.resolved',
    actorId: sodViolations[violationIndex].userId,
    actorRole: sodViolations[violationIndex].existingRoles[0] || 'viewer',
    actorEmail: `user-${sodViolations[violationIndex].userId}@company.com`,
    timestamp: new Date().toISOString(),
    dataBefore: { violation: sodViolations[violationIndex] },
    dataAfter: { status: 'mitigated', mitigation },
    metadata: { violationId }
  })
  
  return true
}

// Enable/disable SoD monitoring
export function setSoDMonitoring(active: boolean): void {
  sodMonitoringActive = active
  logAuditEvent({
    id: crypto.randomUUID(),
    eventType: 'sod.monitoring.changed',
    actorId: 'system',
    actorRole: 'admin',
    actorEmail: 'system@company.com',
    timestamp: new Date().toISOString(),
    dataBefore: { active: !active },
    dataAfter: { active },
    metadata: { changedBy: 'admin' }
  })
}

// Get SoD incompatibility matrix for display
export function getSoDMatrix(): Record<string, { incompatible: string[]; reason: string }> {
  const matrix: Record<string, { incompatible: string[]; reason: string }> = {}
  
  Object.entries({
    'admin-manager': { incompatible: ['manager'], reason: 'Admin can override manager decisions - creates single point of failure' },
    'manager-processor': { incompatible: ['processor'], reason: 'Manager cannot also be Processor: single person cannot both request and approve' },
    'analyst-processor': { incompatible: ['processor'], reason: 'Analyst cannot also be Processor: data access and processing must be separated' },
    'processor-auditor': { incompatible: ['auditor'], reason: 'Processor cannot also be Auditor: cannot audit own processing activities' },
    'auditor-manager': { incompatible: ['manager'], reason: 'Auditor cannot also be Manager: lack of independence in review process' }
  }).forEach(([key, value]) => {
    matrix[key] = value
  })
  
  return matrix
}