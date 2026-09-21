import { found, handler } from '@/lib/server/api'
import { maskEmail, maskName } from '@/lib/server/crypto'
import { findEntity, sampleRows } from '@/lib/server/datasources'
import { canSeePii } from '@/lib/server/projections'

/**
 * Sample rows for a bound entity. The entity's own permission is enforced and
 * PII-marked fields are masked unless the viewer holds a PII-clearing role, so
 * a generated app can never show more than the underlying system would.
 */
export const GET = handler(async ({ user, authorize, audit }, request, params) => {
  const binding = found(findEntity(params.system, params.entity), 'Unknown data source entity.')
  authorize(binding.entity.requiredPermission, {
    resource: 'datasource',
    resourceId: `${binding.system.id}.${binding.entity.id}`,
    eventType: 'datasource.read.denied',
  })
  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit') ?? binding.entity.sampleSize), 50)
  const pii = canSeePii(user)
  const piiFields = binding.entity.fields.filter((field) => field.pii).map((field) => field.name)
  const rows = sampleRows(binding.system, binding.entity, limit).map((row) =>
    pii
      ? row
      : Object.fromEntries(
          Object.entries(row).map(([key, value]) =>
            piiFields.includes(key) && typeof value === 'string' ? [key, /@/.test(value) ? maskEmail(value) : maskName(value)] : [key, value],
          ),
        ),
  )
  audit({
    eventType: 'datasource.read',
    resource: 'datasource',
    resourceId: `${binding.system.id}.${binding.entity.id}`,
    outcome: 'allow',
    metadata: { rows: rows.length, piiMasked: !pii, classification: binding.entity.classification },
  })
  return Response.json({
    system: { id: binding.system.id, name: binding.system.name, status: binding.system.status, latencyMs: binding.system.latencyMs },
    entity: binding.entity,
    rows,
    piiMasked: !pii,
  })
})
