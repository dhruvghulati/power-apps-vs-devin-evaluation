import { handler } from '@/lib/server/api'
import { verifyChain } from '@/lib/server/audit'
import { complianceScore, evaluateControls } from '@/lib/server/compliance'
import { db } from '@/lib/server/store'
import { checkApp } from '@/lib/server/studio'
import type { Environment } from '@/lib/server/types'

const ENVIRONMENTS: { id: Environment; label: string; region: string; dataClass: string }[] = [
  { id: 'development', label: 'Sandbox', region: 'eu-west-1', dataClass: 'Synthetic only' },
  { id: 'staging', label: 'UAT', region: 'eu-central-1', dataClass: 'Masked production' },
  { id: 'production', label: 'Production', region: 'eu-central-1', dataClass: 'Restricted / PII' },
]

/** Admin-centre view: environments, DLP boundaries, maker inventory, posture. */
export const GET = handler(async ({ authorize }) => {
  authorize('platform:govern', { resource: 'platform' })
  const store = db()
  const controls = evaluateControls()

  return Response.json({
    environments: ENVIRONMENTS.map((environment) => ({
      ...environment,
      apps: store.apps.filter((app) => app.environment === environment.id).length,
      flows: store.flows.filter((flow) => flow.environment === environment.id).length,
      dlpPolicy: store.dlpPolicies.find((policy) => policy.environment === environment.id) ?? null,
    })),
    inventory: store.apps.map((app) => ({
      id: app.id,
      name: app.name,
      owner: store.users.find((user) => user.id === app.owner)?.email ?? app.owner,
      environment: app.environment,
      status: app.status,
      version: app.version,
      audienceRoles: app.audienceRoles,
      connectors: app.connectors,
      sessions30d: app.sessions30d,
      updatedAt: app.updatedAt,
      issues: checkApp(app).filter((check) => check.severity !== 'info').length,
    })),
    flows: store.flows.map((flow) => ({
      id: flow.id,
      name: flow.name,
      owner: store.users.find((user) => user.id === flow.owner)?.email ?? flow.owner,
      trigger: flow.trigger,
      status: flow.status,
      environment: flow.environment,
      runCount: flow.runCount,
      lastRunAt: flow.lastRunAt,
    })),
    analytics: {
      apps: store.apps.length,
      publishedApps: store.apps.filter((app) => app.status === 'published').length,
      flows: store.flows.length,
      activeFlows: store.flows.filter((flow) => flow.status === 'active').length,
      makers: new Set([...store.apps.map((app) => app.owner), ...store.flows.map((flow) => flow.owner)]).size,
      sessions30d: store.apps.reduce((sum, app) => sum + app.sessions30d, 0),
      flowRuns: store.flows.reduce((sum, flow) => sum + flow.runCount, 0),
      openTasks: store.flowTasks.filter((task) => task.status === 'open').length,
    },
    posture: { score: complianceScore(controls), failing: controls.filter((c) => c.status === 'fail').length, chain: verifyChain() },
    connectors: store.connectors,
  })
})
