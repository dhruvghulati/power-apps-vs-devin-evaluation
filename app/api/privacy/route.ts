import { handler, HttpError, readJson, required } from '@/lib/server/api'
import { projectDocument } from '@/lib/server/projections'
import { db } from '@/lib/server/store'

interface PrivacyBody {
  action: 'dsar_export' | 'erase'
  customerId: string
  reference: string
}

/** GDPR Articles 15 and 17, with the AML retention override applied. */
export const POST = handler(async ({ authorize, audit }, request) => {
  const body = await readJson<PrivacyBody>(request)
  const customerId = required(body.customerId, 'customerId is required.')
  required(body.reference, 'A data-subject request reference is required.')
  const store = db()

  if (body.action === 'dsar_export') {
    authorize('privacy:dsar', { resource: 'privacy', resourceId: customerId, eventType: 'privacy.dsar.denied' })
    const payload = {
      customerId,
      refunds: store.refunds.filter((refund) => refund.customerId === customerId),
      kycCases: store.kycCases.filter((kycCase) => kycCase.customerId === customerId),
      documents: store.documents
        .filter((doc) => store.kycCases.some((c) => c.customerId === customerId && c.id === doc.caseId))
        .map(projectDocument),
      payments: store.payments.filter((payment) =>
        store.refunds.some((refund) => refund.customerId === customerId && refund.id === payment.refundId),
      ),
    }
    audit({ eventType: 'privacy.dsar_exported', resource: 'privacy', resourceId: customerId, outcome: 'allow', metadata: { reference: body.reference } })
    return Response.json({ export: payload, generatedAt: new Date().toISOString() })
  }

  authorize('privacy:erase', { resource: 'privacy', resourceId: customerId, eventType: 'privacy.erase.denied' })
  const documents = store.documents.filter((doc) =>
    store.kycCases.some((kycCase) => kycCase.customerId === customerId && kycCase.id === doc.caseId),
  )
  const blocked = documents.filter(
    (doc) => doc.legalHold || new Date(doc.retentionUntil).getTime() > Date.now(),
  )
  if (blocked.length > 0) {
    audit({
      eventType: 'privacy.erase_blocked',
      resource: 'privacy',
      resourceId: customerId,
      outcome: 'deny',
      reason: 'AML retention period or legal hold overrides the erasure request.',
      metadata: { reference: body.reference, blockedDocuments: blocked.map((doc) => doc.id) },
    })
    throw new HttpError(409, 'Erasure refused: AML retention (5 years) or a legal hold applies to this customer.', {
      blockedDocuments: blocked.map((doc) => doc.id),
    })
  }

  store.documents = store.documents.filter((doc) => !documents.includes(doc))
  audit({ eventType: 'privacy.erased', resource: 'privacy', resourceId: customerId, outcome: 'allow', metadata: { reference: body.reference, documents: documents.length } })
  return Response.json({ erased: documents.length })
})
