import { ensureAuditHistory, subscribe } from '@/lib/server/audit'
import { evaluate } from '@/lib/server/policy'
import { readSessionUser } from '@/lib/server/session'

export const dynamic = 'force-dynamic'

/** Server-sent events feed of audit and stream activity for live consoles. */
export async function GET(): Promise<Response> {
  ensureAuditHistory()
  const { user } = await readSessionUser()
  const decision = evaluate(user, 'stream:read')
  if (!decision.allow) return Response.json({ error: decision.reason }, { status: 403 })

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      send({ type: 'connected', at: new Date().toISOString() })
      unsubscribe = subscribe(send)
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(': keep-alive\n\n')), 15_000)
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' },
  })
}
