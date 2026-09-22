import { handler } from '@/lib/server/api'
import { projectDocument, projectKycCase } from '@/lib/server/projections'
import { db } from '@/lib/server/store'

export const GET = handler(async ({ user, authorize }) => {
  authorize('kyc:read', { resource: 'kyc_case' })
  const store = db()
  const visible = store.kycCases.filter((kycCase) => user.scope === '*' || kycCase.entity === user.scope)
  return Response.json({
    cases: visible.map((kycCase) => ({
      ...projectKycCase(kycCase, user),
      documents: store.documents.filter((doc) => doc.caseId === kycCase.id).map(projectDocument),
    })),
    hiddenByScope: store.kycCases.length - visible.length,
  })
})
