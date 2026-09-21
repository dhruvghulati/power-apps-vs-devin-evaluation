import { appendAudit, ensureAuditHistory } from './audit'
import { ensureFlowRuntime } from './flows'
import { evaluate, type PolicyContext } from './policy'
import { readSessionUser } from './session'
import type { Permission, User } from './types'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export interface ActorContext {
  user: User
  ip: string
  /**
   * Authorize an action. A denial is recorded in the audit trail before the
   * request is rejected — denied attempts are the evidence auditors look for.
   */
  authorize: (
    permission: Permission,
    options?: PolicyContext & { resource: string; resourceId?: string; eventType?: string },
  ) => string[]
  audit: (input: Omit<Parameters<typeof appendAudit>[0], 'actor' | 'ipAddress'>) => void
}

type Handler = (ctx: ActorContext, request: Request, params: Record<string, string>) => Promise<Response> | Response

/** Wraps a route handler with session resolution, policy enforcement and audit. */
export function handler(fn: Handler) {
  return async (request: Request, context?: { params?: Promise<Record<string, string>> }): Promise<Response> => {
    ensureAuditHistory()
    ensureFlowRuntime()
    const { user } = await readSessionUser()
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
    const params = (await context?.params) ?? {}

    const actor: ActorContext = {
      user,
      ip,
      authorize(permission, options) {
        const { resource, resourceId, eventType, ...policyCtx } = options ?? { resource: permission.split(':')[0] }
        const decision = evaluate(user, permission, policyCtx)
        if (!decision.allow) {
          appendAudit({
            eventType: eventType ?? `${permission}.denied`,
            actor: user,
            resource,
            resourceId,
            outcome: 'deny',
            reason: decision.reason,
            ipAddress: ip,
            metadata: { permission },
          })
          throw new HttpError(403, decision.reason, { permission, policy: 'deny' })
        }
        return decision.obligations
      },
      audit(input) {
        appendAudit({ ...input, actor: user, ipAddress: ip })
      },
    }

    try {
      return await fn(actor, request, params)
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ error: error.message, ...error.details }, { status: error.status })
      }
      appendAudit({
        eventType: 'request.error',
        actor: user,
        resource: 'system',
        outcome: 'error',
        reason: error instanceof Error ? error.message : 'unknown error',
        ipAddress: ip,
      })
      return Response.json({ error: 'Internal error' }, { status: 500 })
    }
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.')
  }
}

export function required<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null || value === '') throw new HttpError(400, message)
  return value
}

export function found<T>(value: T | undefined | null, message: string): T {
  if (!value) throw new HttpError(404, message)
  return value
}
