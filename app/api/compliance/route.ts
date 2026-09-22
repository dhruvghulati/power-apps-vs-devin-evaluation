import { handler } from '@/lib/server/api'
import { verifyChain } from '@/lib/server/audit'
import { complianceScore, evaluateControls } from '@/lib/server/compliance'
import { sodConflicts } from '@/lib/server/policy'
import { db } from '@/lib/server/store'

export const GET = handler(async ({ authorize }) => {
  authorize('compliance:read', { resource: 'compliance' })
  const controls = evaluateControls()
  const store = db()
  return Response.json({
    controls,
    score: complianceScore(controls),
    byFramework: Object.fromEntries(
      [...new Set(controls.flatMap((control) => control.framework))].map((framework) => {
        const scoped = controls.filter((control) => control.framework.includes(framework))
        return [framework, { score: complianceScore(scoped), controls: scoped.length }]
      }),
    ),
    chain: verifyChain(),
    sodMatrix: sodConflicts,
    accessReviews: store.accessReviews,
    retention: [
      { framework: 'SOX', requirement: '7 years', applies: 'Audit trail' },
      { framework: 'SEC 17a-4', requirement: '6 years (2 hot)', applies: 'Transaction records' },
      { framework: 'MiFID II', requirement: '5 years', applies: 'Decision records' },
      { framework: 'AMLR EU 2024/1624', requirement: '5 years', applies: 'KYC evidence' },
    ],
  })
})
