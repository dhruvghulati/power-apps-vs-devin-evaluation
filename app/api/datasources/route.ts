import { handler } from '@/lib/server/api'
import { dataSystems } from '@/lib/server/datasources'
import { hasPermission } from '@/lib/server/policy'
import { db } from '@/lib/server/store'

/** Connection catalogue: what a maker may bind to, and what DLP says about it. */
export const GET = handler(async ({ user, authorize }) => {
  authorize('app:read', { resource: 'datasource' })
  const dlp = db().dlpPolicies
  return Response.json({
    systems: dataSystems.map((system) => ({
      ...system,
      entities: system.entities.map((entity) => ({
        ...entity,
        bindable: hasPermission(user, entity.requiredPermission),
        piiFields: entity.fields.filter((field) => field.pii).map((field) => field.name),
      })),
      environments: dlp.map((policy) => ({
        environment: policy.environment,
        allowed: !policy.blockedConnectors.includes(system.id),
        group: policy.businessConnectors.includes(system.id) ? 'business' : policy.nonBusinessConnectors.includes(system.id) ? 'non-business' : system.businessData ? 'business' : 'non-business',
      })),
    })),
  })
})
