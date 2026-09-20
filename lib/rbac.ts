// RBAC configuration with preventive SoD (Segregation of Duties)
// Role hierarchy and incompatibility matrix for SOC2 compliance

export type Role = 'admin' | 'manager' | 'analyst' | 'processor' | 'auditor' | 'viewer'

export type Permission = 
  | 'refund:read'
  | 'refund:write'
  | 'refund:approve'
  | 'refund:reject'
  | 'refund:export'
  | 'kyc:read'
  | 'kyc:write'
  | 'kyc:approve'
  | 'kyc:reject'
  | 'kyc:export'
  | 'flag:read'
  | 'flag:write'
  | 'flag:create'
  | 'flag:delete'
  | 'flag:toggle'
  | 'admin:read'
  | 'admin:write'
  | 'admin:users'
  | 'admin:roles'
  | 'audit:read'
  | 'audit:export'
  | 'audit:pii_view'
  | 'compliance:read'
  | 'compliance:write'
  | '*'

export interface RoleDefinition {
  id: Role
  name: string
  description: string
  priority: number
  permissions: Permission[]
}

export interface User {
  id: string
  name: string
  email: string
  roles: Role[]
  department: string
}

// Role definitions with hierarchical priority
export const roles: Record<Role, RoleDefinition> = {
  admin: {
    id: 'admin',
    name: 'Administrator',
    description: 'Full system access with all permissions',
    priority: 100,
    permissions: ['*'] // Wildcard for all permissions
  },
  manager: {
    id: 'manager',
    name: 'Manager',
    description: 'Can approve/reject refunds and KYC cases',
    priority: 50,
    permissions: [
      'refund:read',
      'refund:write',
      'refund:approve',
      'refund:reject',
      'kyc:read',
      'kyc:write',
      'kyc:approve',
      'kyc:reject',
      'flag:read',
      'flag:write',
      'flag:toggle',
      'audit:read',
      'compliance:read'
    ]
  },
  analyst: {
    id: 'analyst',
    name: 'Analyst',
    description: 'Read-only access with export capability',
    priority: 30,
    permissions: [
      'refund:read',
      'refund:export',
      'kyc:read',
      'kyc:export',
      'flag:read',
      'audit:read',
      'compliance:read'
    ]
  },
  processor: {
    id: 'processor',
    name: 'Processor',
    description: 'Can process refunds and KYC cases',
    priority: 25,
    permissions: [
      'refund:read',
      'refund:write',
      'kyc:read',
      'kyc:write',
      'flag:read',
      'audit:read'
    ]
  },
  auditor: {
    id: 'auditor',
    name: 'Auditor',
    description: 'Read-only access to audit logs and compliance data',
    priority: 20,
    permissions: [
      'audit:read',
      'audit:export',
      'audit:pii_view',
      'compliance:read'
    ]
  },
  viewer: {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access, no export',
    priority: 10,
    permissions: [
      'refund:read',
      'kyc:read',
      'flag:read',
      'compliance:read'
    ]
  }
}

// SoD Incompatibility Matrix
// Preventive SoD: These role combinations are blocked at provisioning time
export const sodIncompatibilityMatrix: Record<string, string[]> = {
  admin: [], // Admin has no restrictions (but should be rare)
  manager: ['processor'], // Manager cannot also be processor
  analyst: ['processor'], // Analyst cannot also be processor
  processor: ['auditor', 'analyst'], // Processor cannot also be auditor or analyst
  auditor: ['processor', 'manager'], // Auditor cannot also be processor or manager
  viewer: [] // Viewer has no restrictions
}

// SoD violation descriptions
export const sodViolationDescriptions: Record<string, string> = {
  'manager-developer': 'Manager cannot also be Developer: creates conflict of interest in financial decisions',
  'manager-processor': 'Manager cannot also be Processor: single person cannot both request and approve',
  'analyst-processor': 'Analyst cannot also be Processor: data access and processing must be separated',
  'processor-auditor': 'Processor cannot also be Auditor: cannot audit own processing activities',
  'processor-manager': 'Processor cannot also be Manager: single person cannot both process and approve',
  'auditor-manager': 'Auditor cannot also be Manager: lack of independence in review process'
}

// Check if a role combination creates an SoD conflict
export function checkSoDConflict(existingRoles: Role[], newRole: Role): { hasConflict: boolean; conflictWith?: Role; reason?: string } {
  for (const existingRole of existingRoles) {
    const incompatibleRoles = sodIncompatibilityMatrix[existingRole] || []
    if (incompatibleRoles.includes(newRole)) {
      const conflictKey = `${existingRole}-${newRole}`.replace('developer', existingRole).replace(newRole, existingRole)
      return {
        hasConflict: true,
        conflictWith: existingRole,
        reason: sodViolationDescriptions[conflictKey] || `Role ${existingRole} is incompatible with ${newRole}`
      }
    }
    
    // Check reverse (the matrix might be asymmetric)
    const newRoleIncompatible = sodIncompatibilityMatrix[newRole] || []
    if (newRoleIncompatible.includes(existingRole)) {
      const conflictKey = `${newRole}-${existingRole}`
      return {
        hasConflict: true,
        conflictWith: existingRole,
        reason: sodViolationDescriptions[conflictKey] || `Role ${newRole} is incompatible with ${existingRole}`
      }
    }
  }
  
  return { hasConflict: false }
}

// Check if user has a specific permission
export function hasPermission(user: User, permission: Permission): boolean {
  if (user.roles.includes('admin')) return true
  
  for (const role of user.roles) {
    const roleDef = roles[role]
    if (roleDef.permissions.includes('*')) return true
    if (roleDef.permissions.includes(permission)) return true
  }
  
  return false
}

// Check if user has any of the specified permissions
export function hasAnyPermission(user: User, permissions: Permission[]): boolean {
  return permissions.some(perm => hasPermission(user, perm))
}

// Get all permissions for a user
export function getUserPermissions(user: User): Permission[] {
  if (user.roles.includes('admin')) {
    return Object.values(roles).flatMap(r => r.permissions)
  }
  
  const permissionSet = new Set<Permission>()
  for (const role of user.roles) {
    const roleDef = roles[role]
    roleDef.permissions.forEach(p => permissionSet.add(p))
  }
  
  return Array.from(permissionSet)
}

// Mock users for demo
export const mockUsers: User[] = [
  {
    id: 'user-001',
    name: 'Alice Johnson',
    email: 'alice.johnson@company.com',
    roles: ['admin'],
    department: 'Engineering'
  },
  {
    id: 'user-002',
    name: 'Bob Smith',
    email: 'bob.smith@company.com',
    roles: ['manager'],
    department: 'Operations'
  },
  {
    id: 'user-003',
    name: 'Carol Davis',
    email: 'carol.davis@company.com',
    roles: ['analyst'],
    department: 'Finance'
  },
  {
    id: 'user-004',
    name: 'David Wilson',
    email: 'david.wilson@company.com',
    roles: ['processor'],
    department: 'Operations'
  },
  {
    id: 'user-005',
    name: 'Eva Martinez',
    email: 'eva.martinez@company.com',
    roles: ['auditor'],
    department: 'Compliance'
  },
  {
    id: 'user-006',
    name: 'Frank Lee',
    email: 'frank.lee@company.com',
    roles: ['viewer'],
    department: 'Support'
  }
]

// Current user context (for demo, this would come from auth session)
let currentUser: User = mockUsers[0]

export function getCurrentUser(): User {
  return currentUser
}

export function setCurrentUser(user: User): void {
  currentUser = user
}

export function switchUser(userId: string): User | undefined {
  const user = mockUsers.find(u => u.id === userId)
  if (user) {
    setCurrentUser(user)
  }
  return user
}