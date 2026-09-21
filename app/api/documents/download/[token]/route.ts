import { found, handler, HttpError } from '@/lib/server/api'
import { decryptDocument, sha256 } from '@/lib/server/crypto'
import { db } from '@/lib/server/store'

/** Single-use, short-lived, bound to the identity that requested the grant. */
export const GET = handler(async ({ user, audit }, _request, params) => {
  const store = db()
  const grant = found(store.downloadGrants.find((g) => g.token === params.token), 'Download grant not found.')
  const document = found(store.documents.find((doc) => doc.id === grant.documentId), 'Document not found.')

  if (grant.userId !== user.id) throw new HttpError(403, 'This download grant belongs to another identity.')
  if (grant.used) throw new HttpError(410, 'This download grant has already been used.')
  if (new Date(grant.expiresAt).getTime() < Date.now()) throw new HttpError(410, 'This download grant has expired.')

  const plaintext = decryptDocument(document.cipher)
  if (sha256(plaintext) !== document.sha256) {
    audit({ eventType: 'document.integrity_failure', resource: 'kyc_document', resourceId: document.id, outcome: 'error', reason: 'Checksum mismatch on decrypt.' })
    throw new HttpError(500, 'Document integrity check failed; access blocked.')
  }

  grant.used = true
  document.downloadCount += 1
  audit({
    eventType: 'document.downloaded',
    resource: 'kyc_document',
    resourceId: document.id,
    outcome: 'allow',
    metadata: { reason: grant.reason, caseId: document.caseId, sha256: document.sha256 },
  })

  return new Response(new Uint8Array(plaintext), {
    headers: {
      'content-type': document.contentType,
      'content-disposition': `attachment; filename="${document.filename}"`,
      'cache-control': 'no-store',
      'x-document-sha256': document.sha256,
    },
  })
})
