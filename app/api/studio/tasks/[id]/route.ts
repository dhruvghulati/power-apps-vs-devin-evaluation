import { found, handler, HttpError, readJson, required } from '@/lib/server/api'
import { db, timestamp } from '@/lib/server/store'

interface DecisionBody {
  decision: 'approved' | 'rejected'
  notes: string
}

/** Human approval step inside a flow run, gated by the step's approver role. */
export const POST = handler(async ({ user, authorize, audit }, request, params) => {
  authorize('flow:read', { resource: 'flow_task', resourceId: params.id })
  const body = await readJson<DecisionBody>(request)
  required(body.notes, 'Approval notes are required.')
  const task = found(db().flowTasks.find((candidate) => candidate.id === params.id), 'Task not found.')

  if (task.status !== 'open') throw new HttpError(409, `Task already ${task.status}.`)
  if (!user.roles.includes(task.approverRole))
    throw new HttpError(403, `This step requires the ${task.approverRole} role; you hold ${user.roles.join(', ')}.`)

  const run = db().flowRuns.find((candidate) => candidate.id === task.flowRunId)
  if (run?.triggeredBy === user.id)
    throw new HttpError(403, 'Maker-checker: you cannot approve a flow run you triggered.')

  task.status = body.decision
  task.decidedBy = user.id
  task.decidedAt = timestamp()
  if (run) {
    run.status = body.decision === 'approved' ? 'completed' : 'stopped'
    const step = run.steps.find((candidate) => candidate.kind === 'approval')
    if (step) {
      step.outcome = body.decision === 'approved' ? 'executed' : 'stopped'
      step.detail = `${body.decision} by ${user.email}: ${body.notes}`
    }
  }

  audit({
    eventType: `flow.task_${body.decision}`,
    resource: 'flow_task',
    resourceId: task.id,
    outcome: 'allow',
    after: { decision: body.decision, flowRunId: task.flowRunId },
    metadata: { notes: body.notes },
  })
  return Response.json({ task, run })
})
