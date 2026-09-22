import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { projectDocument, projectKycCase } from '@/lib/server/projections'
import { db, timestamp } from '@/lib/server/store'

type Action = 'claim' | 'recommend' | 'escalate' | 'approve' | 'reject'

export const GET = handler(async ({ user, authorize }, _request, params) => {
  authorize('kyc:read', { resource: 'kyc_case', resourceId: params.id })
  const store = db()
  const kycCase = found(store.kycCases.find((c) => c.id === params.id), 'Case not found.')
  return Response.json({
    case: projectKycCase(kycCase, user),
    documents: store.documents.filter((doc) => doc.caseId === kycCase.id).map(projectDocument),
  })
})

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const kycCase = found(store.kycCases.find((c) => c.id === params.id), 'Case not found.')
  const { action, notes } = await readJson<{ action: Action; notes?: string }>(request)
  const before = { status: kycCase.status, reviewedBy: kycCase.reviewedBy, decidedBy: kycCase.decidedBy }

  switch (required(action, 'action is required.')) {
    case 'claim': {
      authorize('kyc:write', { resource: 'kyc_case', resourceId: kycCase.id, entity: kycCase.entity, eventType: 'kyc.claim.denied' })
      kycCase.assignedTo = user.id
      kycCase.status = kycCase.status === 'pending_documents' ? 'pending_documents' : 'in_review'
      break
    }
    case 'recommend': {
      authorize('kyc:write', { resource: 'kyc_case', resourceId: kycCase.id, entity: kycCase.entity, eventType: 'kyc.recommend.denied' })
      required(notes, 'A CDD summary is required before recommending a decision.')
      kycCase.reviewedBy = user.id
      kycCase.status = 'in_review'
      break
    }
    case 'escalate': {
      authorize('kyc:escalate', { resource: 'kyc_case', resourceId: kycCase.id, entity: kycCase.entity, eventType: 'kyc.escalate.denied' })
      required(notes, 'Escalation rationale is required for the MLRO file.')
      kycCase.status = 'escalated'
      break
    }
    case 'approve':
    case 'reject': {
      authorize('kyc:decide', {
        resource: 'kyc_case',
        resourceId: kycCase.id,
        entity: kycCase.entity,
        initiatorId: kycCase.reviewedBy,
        eventType: `kyc.${action}.denied`,
      })
      required(notes, 'A decision rationale is retained for 5 years under AMLR.')
      const documents = store.documents.filter((doc) => doc.caseId === kycCase.id)
      if (action === 'approve') {
        const unverified = documents.filter((doc) => doc.status !== 'verified')
        if (documents.length === 0 || unverified.length > 0) {
          throw new HttpError(409, `Cannot approve: ${unverified.length || 'all'} document(s) are not verified.`)
        }
        if (kycCase.sanctionsScreening.result !== 'clear') {
          throw new HttpError(409, 'Cannot approve while sanctions screening is unresolved; escalate to the MLRO.')
        }
      }
      kycCase.status = action === 'approve' ? 'approved' : 'rejected'
      kycCase.decidedBy = user.id
      kycCase.decidedAt = timestamp()
      kycCase.decisionNotes = notes
      break
    }
    default:
      throw new HttpError(400, `Unsupported action ${action}.`)
  }

  audit({
    eventType: `kyc.${action}`,
    resource: 'kyc_case',
    resourceId: kycCase.id,
    outcome: 'allow',
    before,
    after: { status: kycCase.status, reviewedBy: kycCase.reviewedBy, decidedBy: kycCase.decidedBy },
    metadata: { notes, riskRating: kycCase.riskRating },
  })
  return Response.json({ case: projectKycCase(kycCase, user) })
})
