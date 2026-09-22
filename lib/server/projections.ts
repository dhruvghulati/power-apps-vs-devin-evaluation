import { maskEmail, maskName } from './crypto'
import { hasPermission } from './policy'
import type { AuditEvent, KycCase, KycDocument, Payment, PaymentInstrument, Refund, User } from './types'

export function canSeePii(user: User): boolean {
  return hasPermission(user, 'audit:pii_view') || hasPermission(user, 'kyc:decide') || hasPermission(user, 'kyc:write')
}

export function projectRefund(refund: Refund, user: User) {
  const pii = canSeePii(user)
  return {
    ...refund,
    customerName: pii ? refund.customerName : maskName(refund.customerName),
    customerEmail: pii ? refund.customerEmail : maskEmail(refund.customerEmail),
    piiMasked: !pii,
  }
}

export function projectKycCase(kycCase: KycCase, user: User) {
  const pii = canSeePii(user)
  return {
    ...kycCase,
    customerName: pii ? kycCase.customerName : maskName(kycCase.customerName),
    customerEmail: pii ? kycCase.customerEmail : maskEmail(kycCase.customerEmail),
    dateOfBirth: pii ? kycCase.dateOfBirth : '****-**-**',
    piiMasked: !pii,
    slaBreached: new Date(kycCase.slaDueAt).getTime() < Date.now() && !['approved', 'rejected'].includes(kycCase.status),
  }
}

/** Ciphertext and key material never leave the server. */
export function projectDocument(document: KycDocument) {
  const { cipher, ...rest } = document
  return { ...rest, encryption: { algorithm: 'AES-256-GCM', keyId: cipher.keyId } }
}

export function projectInstrument(instrument: PaymentInstrument, user: User) {
  const reveal = hasPermission(user, 'payment:instrument_reveal')
  return {
    id: instrument.id,
    brand: instrument.brand,
    last4: reveal ? instrument.last4 : '****',
    country: instrument.country,
    token: reveal ? instrument.token : `${instrument.token.slice(0, 8)}…`,
  }
}

export function projectPayment(payment: Payment) {
  return payment
}

export function projectAuditEvent(event: AuditEvent, user: User) {
  if (hasPermission(user, 'audit:pii_view')) return event
  return { ...event, actorEmail: maskEmail(event.actorEmail), before: redact(event.before), after: redact(event.after) }
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (/email/i.test(key) && typeof entry === 'string') return [key, maskEmail(entry)]
      if (/name/i.test(key) && typeof entry === 'string') return [key, maskName(entry)]
      return [key, entry]
    }),
  )
}
