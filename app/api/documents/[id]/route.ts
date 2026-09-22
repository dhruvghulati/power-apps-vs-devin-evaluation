import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { randomId } from '@/lib/server/crypto'
import { projectDocument } from '@/lib/server/projections'
import { db, timestamp } from '@/lib/server/store'

const GRANT_TTL_MS = 5 * 60 * 1000

type Action = 'grant_download' | 'verify' | 'reject' | 'legal_hold' | 'release_hold'

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const document = found(store.documents.find((doc) => doc.id === params.id), 'Document not found.')
  const kycCase = found(store.kycCases.find((c) => c.id === document.caseId), 'Case not found.')
  const { action, reason } = await readJson<{ action: Action; reason?: string }>(request)
  const before = { status: document.status, legalHold: document.legalHold }

  switch (required(action, 'action is required.')) {
    case 'grant_download': {
      authorize('kyc:document_download', {
        resource: 'kyc_document',
        resourceId: document.id,
        entity: kycCase.entity,
        eventType: 'document.download.denied',
      })
      required(reason, 'A business reason is recorded against every document access.')
      const grant = {
        token: randomId('grt'),
        documentId: document.id,
        userId: user.id,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
        used: false,
        reason: reason!,
      }
      store.downloadGrants.push(grant)
      audit({
        eventType: 'document.download_granted',
        resource: 'kyc_document',
        resourceId: document.id,
        outcome: 'allow',
        metadata: { reason, expiresAt: grant.expiresAt, singleUse: true },
      })
      return Response.json({ grant: { token: grant.token, expiresAt: grant.expiresAt }, url: `/api/documents/download/${grant.token}` })
    }
    case 'verify':
    case 'reject': {
      authorize('kyc:write', { resource: 'kyc_document', resourceId: document.id, entity: kycCase.entity, eventType: `document.${action}.denied` })
      if (document.uploadedBy === user.id && action === 'verify' && !user.roles.includes('kyc_reviewer')) {
        throw new HttpError(403, 'Document verification must be performed by a KYC reviewer.')
      }
      document.status = action === 'verify' ? 'verified' : 'rejected'
      document.verifiedBy = user.id
      document.verifiedAt = timestamp()
      document.rejectionReason = action === 'reject' ? required(reason, 'A rejection reason is required.') : undefined
      break
    }
    case 'legal_hold':
    case 'release_hold': {
      authorize('privacy:erase', { resource: 'kyc_document', resourceId: document.id, eventType: `document.${action}.denied` })
      document.legalHold = action === 'legal_hold'
      break
    }
    default:
      throw new HttpError(400, `Unsupported action ${action}.`)
  }

  audit({
    eventType: `document.${action}`,
    resource: 'kyc_document',
    resourceId: document.id,
    outcome: 'allow',
    before,
    after: { status: document.status, legalHold: document.legalHold },
    metadata: { reason },
  })
  return Response.json({ document: projectDocument(document) })
})
