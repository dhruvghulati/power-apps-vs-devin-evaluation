export interface ComponentInstance {
  instanceId: string
  componentId: string
  props: Record<string, unknown>
}

export interface AppScreen {
  id: string
  name: string
  components: ComponentInstance[]
}

export interface MakerApp {
  id: string
  name: string
  description: string
  owner: string
  environment: "development" | "staging" | "production"
  status: "draft" | "published" | "retired"
  resource: string
  version: number
  audienceRoles: string[]
  connectors: string[]
  updatedAt: string
  publishedAt?: string
  sessions30d: number
  screens: AppScreen[]
}

export interface ComponentDefinition {
  id: string
  name: string
  description: string
  category: string
  requiredPermission: string
  governance: string[]
  props: { key: string; label: string; type: "text" | "resource" | "binding" | "columns" | "number" | "boolean" }[]
}

export interface SolutionCheck {
  id: string
  severity: "error" | "warning" | "info"
  message: string
}

export interface FieldDefinition {
  name: string
  type: string
  pii: boolean
  description: string
}

export interface EntityDefinition {
  id: string
  name: string
  description: string
  classification: "public" | "internal" | "confidential" | "restricted"
  fields: FieldDefinition[]
  requiredPermission: string
  bindable: boolean
  piiFields: string[]
}

export interface DataSystem {
  id: string
  name: string
  vendor: string
  kind: string
  protocol: string
  auth: string
  residency: string
  businessData: boolean
  status: "connected" | "degraded" | "disconnected"
  latencyMs: number
  refresh: string
  owner: string
  entities: EntityDefinition[]
  environments: { environment: string; allowed: boolean; group: string }[]
}

export const DATA_RESOURCES = ["refunds", "kyc", "payments", "audit", "flags"] as const
export const ROLE_IDS = [
  "admin",
  "manager",
  "analyst",
  "processor",
  "auditor",
  "viewer",
  "kyc_reviewer",
  "kyc_approver",
  "payments_operator",
  "experiment_owner",
] as const
