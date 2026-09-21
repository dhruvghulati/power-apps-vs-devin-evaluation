import { found, handler, HttpError } from '@/lib/server/api'
import { encryptDocument, randomId, sha256 } from '@/lib/server/crypto'
import { projectDocument } from '@/lib/server/projections'
import { db, timestamp } from '@/lib/server/store'
import type { DocumentKind, KycDocument } from '@/lib/server/types'

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const KINDS: DocumentKind[] = ['passport', 'drivers_license', 'proof_of_address', 'source_of_funds', 'selfie']

export const GET = handler(async ({ authorize }, _request, params) => {
  authorize('kyc:read', { resource: 'kyc_document', resourceId: params.id })
  return Response.json({ documents: db().documents.filter((doc) => doc.caseId === params.id).map(projectDocument) })
})

export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  const store = db()
  const kycCase = found(store.kycCases.find((c) => c.id === params.id), 'Case not found.')
  authorize('kyc:document_upload', {
    resource: 'kyc_document',
    resourceId: kycCase.id,
    entity: kycCase.entity,
    eventType: 'kyc.document_upload.denied',
  })

  const form = await request.formData()
  const file = form.get('file')
  const kind = String(form.get('kind') ?? '') as DocumentKind
  if (!(file instanceof File)) throw new HttpError(400, 'A file part is required.')
  if (!KINDS.includes(kind)) throw new HttpError(400, `kind must be one of ${KINDS.join(', ')}.`)
  if (file.size > MAX_BYTES) throw new HttpError(413, 'Documents are limited to 8 MB.')
  if (!ALLOWED_TYPES.includes(file.type)) throw new HttpError(415, `Content type ${file.type} is not accepted.`)

  const bytes = Buffer.from(await file.arrayBuffer())
  const document: KycDocument = {
    id: randomId('doc'),
    caseId: kycCase.id,
    kind,
    filename: file.name,
    contentType: file.type,
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
    uploadedBy: user.id,
    uploadedAt: timestamp(),
    status: 'uploaded',
    cipher: encryptDocument(bytes),
    residency: kycCase.entity === 'us-entity' ? 'us-east-1' : 'eu-central-1',
    retentionUntil: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    legalHold: false,
    downloadCount: 0,
  }
  store.documents.push(document)
  if (kycCase.status === 'pending_documents') kycCase.status = 'in_review'

  audit({
    eventType: 'document.uploaded',
    resource: 'kyc_document',
    resourceId: document.id,
    outcome: 'allow',
    after: { caseId: kycCase.id, kind, sha256: document.sha256, sizeBytes: document.sizeBytes, residency: document.residency },
    metadata: { encryption: 'AES-256-GCM', keyId: document.cipher.keyId },
  })
  return Response.json({ document: projectDocument(document) }, { status: 201 })
})
