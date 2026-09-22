import { handler } from '@/lib/server/api'
import { db } from '@/lib/server/store'

export const GET = handler(async ({ authorize }) => {
  authorize('flag:read', { resource: 'feature_flag' })
  const store = db()
  return Response.json({
    flags: store.flags,
    changeRequests: store.changeRequests,
    experiments: store.experiments,
  })
})
