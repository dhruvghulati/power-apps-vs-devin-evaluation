import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Demo key management. In production these resolve to a KMS/HSM-backed key
 * (AWS KMS, Azure Key Vault) and the key id is stored with every envelope so
 * rotated keys can still decrypt historical documents.
 */
const KEY_ID = process.env.DOCUMENT_KEY_ID ?? 'kms-demo-2026-q1'
const documentKey = deriveKey(process.env.DOCUMENT_ENCRYPTION_KEY ?? 'demo-document-master-key', 'document-store')
const sessionKey = deriveKey(process.env.SESSION_SECRET ?? 'demo-session-secret', 'session')

function deriveKey(secret: string, label: string): Buffer {
  return createHash('sha256').update(`${label}:${secret}`).digest()
}

export interface Envelope {
  iv: string
  tag: string
  data: string
  keyId: string
}

export function encryptDocument(plaintext: Buffer): Envelope {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', documentKey, iv)
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    keyId: KEY_ID,
  }
}

export function decryptDocument(envelope: Envelope): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', documentKey, Buffer.from(envelope.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()])
}

export function sha256(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function verifySignature(secret: string, payload: string, signature: string): boolean {
  const expected = Buffer.from(hmac(secret, payload))
  const provided = Buffer.from(signature ?? '')
  return expected.length === provided.length && timingSafeEqual(expected, provided)
}

export function signSession(payload: string): string {
  return `${payload}.${createHmac('sha256', sessionKey).update(payload).digest('base64url')}`
}

export function verifySession(cookieValue: string): string | null {
  const index = cookieValue.lastIndexOf('.')
  if (index <= 0) return null
  const payload = cookieValue.slice(0, index)
  const expected = signSession(payload)
  const a = Buffer.from(cookieValue)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return payload
}

export function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`
}

export function maskName(name: string): string {
  return name
    .split(' ')
    .map((part) => `${part.charAt(0)}${'*'.repeat(Math.max(part.length - 1, 2))}`)
    .join(' ')
}
