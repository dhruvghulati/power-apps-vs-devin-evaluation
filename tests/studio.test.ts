import { beforeEach, describe, expect, it } from 'vitest'
import { dataSystems, findEntity, sampleRows } from '@/lib/server/datasources'
import { evaluateExpression, resumeRun, runFlow, sampleEvents } from '@/lib/server/flows'
import { checkApp, instantiateTemplate, templateCatalog, visibleApps } from '@/lib/server/studio'
import type { MakerApp } from '@/lib/server/studio-types'
import type { Flow } from '@/lib/server/studio-types'
import { db, resetDb } from '@/lib/server/store'

const template = (id: string) => {
  const found = templateCatalog.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`missing template ${id}`)
  return found
}

const bind = (app: MakerApp, binding: string): MakerApp => ({
  ...app,
  screens: app.screens.map((screen, index) =>
    index === 0
      ? { ...screen, components: screen.components.map((component, i) => (i === 0 ? { ...component, props: { ...component.props, binding } } : component)) }
      : screen,
  ),
})

beforeEach(() => {
  resetDb()
})

describe('solution checker', () => {
  it('passes a clean template in production', () => {
    const app = instantiateTemplate(template('tpl_refund_ops'), { owner: 'usr_bob', environment: 'production' })
    expect(checkApp(app).filter((check) => check.severity === 'error')).toEqual([])
  })

  it('fails an empty app or one without an audience', () => {
    const app = instantiateTemplate(template('tpl_blank'), { owner: 'usr_bob', environment: 'development', audienceRoles: [] })
    const ids = checkApp(app).map((check) => check.id)
    expect(ids).toContain('empty-app')
    expect(ids).toContain('no-audience')
  })

  it('blocks a DLP-blocked system binding in development but allows it in production', () => {
    const base = instantiateTemplate(template('tpl_refund_ops'), { owner: 'usr_bob', environment: 'development' })
    const dev = bind(base, 'sys_core.accounts')
    expect(checkApp(dev).some((check) => check.id === 'dlp-binding:sys_core.accounts' && check.severity === 'error')).toBe(true)
    const prod = bind({ ...base, environment: 'production' }, 'sys_core.accounts')
    expect(checkApp(prod).some((check) => check.id.startsWith('dlp-binding'))).toBe(false)
  })

  it('rejects unknown bindings and restricted entities exposed to viewers', () => {
    const base = instantiateTemplate(template('tpl_refund_ops'), { owner: 'usr_bob', environment: 'production', audienceRoles: ['manager', 'viewer'] })
    expect(checkApp(bind(base, 'sys_nope.thing')).some((check) => check.id === 'binding-unknown:sys_nope.thing')).toBe(true)
    const restricted = dataSystems.flatMap((system) => system.entities.map((entity) => ({ system, entity }))).find((pair) => pair.entity.classification === 'restricted')
    if (!restricted) throw new Error('catalog needs a restricted entity')
    const checks = checkApp(bind(base, `${restricted.system.id}.${restricted.entity.id}`))
    expect(checks.some((check) => check.id.startsWith('restricted-audience') && check.severity === 'error')).toBe(true)
  })

  it('forbids mixing business and non-business connectors in one app', () => {
    const app = instantiateTemplate(template('tpl_refund_ops'), { owner: 'usr_bob', environment: 'production' })
    app.connectors = ['sys_psp', 'sys_crm']
    expect(checkApp(app).some((check) => check.id === 'dlp-mix')).toBe(true)
  })
})

describe('app visibility', () => {
  it('shows published apps only to their audience and drafts only to owners/admins', () => {
    const store = db()
    const frank = store.users.find((u) => u.id === 'usr_frank')
    const bob = store.users.find((u) => u.id === 'usr_bob')
    const alice = store.users.find((u) => u.id === 'usr_alice')
    if (!frank || !bob || !alice) throw new Error('seed users missing')
    const draft = store.apps.find((app) => app.status === 'draft')
    if (!draft) throw new Error('seed draft app missing')
    expect(visibleApps(frank).map((app) => app.id)).not.toContain(draft.id)
    expect(visibleApps(alice).map((app) => app.id)).toContain(draft.id)
    expect(visibleApps(bob).every((app) => app.status === 'published' ? app.audienceRoles.includes('manager') || app.owner === bob.id : app.owner === bob.id)).toBe(true)
  })
})

describe('synthetic data systems', () => {
  it('generates deterministic rows that match the declared schema', () => {
    const bound = findEntity('sys_psp', 'payouts')
    if (!bound) throw new Error('catalog missing sys_psp.payouts')
    const first = sampleRows(bound.system, bound.entity, 5)
    const second = sampleRows(bound.system, bound.entity, 5)
    expect(first).toEqual(second)
    expect(first).toHaveLength(5)
    for (const row of first) for (const field of bound.entity.fields) expect(row).toHaveProperty(field.name)
  })

  it('marks PII fields on every system that carries customer identifiers', () => {
    const crm = findEntity('sys_crm', 'cases')
    if (!crm) throw new Error('catalog missing sys_crm.cases')
    expect(crm.entity.fields.some((field) => field.pii)).toBe(true)
    expect(findEntity('sys_core', 'missing')).toBeNull()
  })
})

describe('flow runtime', () => {
  const flow = (steps: Flow['steps']): Flow => ({
    id: 'flw_test',
    name: 'Test flow',
    description: '',
    owner: 'usr_bob',
    environment: 'development',
    trigger: 'refund.created',
    steps,
    status: 'active',
    connectors: [],
    createdAt: new Date().toISOString(),
    runCount: 0,
  })

  it('stops when a condition fails and records the decision on the audit chain', () => {
    const before = db().auditEvents.length
    const run = runFlow(flow([{ id: 's1', kind: 'condition', field: 'amountMinor', operator: 'gt', value: '100000' }]), { amountMinor: 500 }, 'test', 'evt_1')
    expect(run.status).toBe('stopped')
    expect(db().auditEvents.length).toBe(before + 1)
    expect(db().auditEvents.at(-1)?.outcome).toBe('deny')
  })

  it('creates an approval task bound to the run and halts until decided', () => {
    const openBefore = db().flowTasks.filter((task) => task.status === 'open').length
    const run = runFlow(
      flow([
        { id: 's1', kind: 'condition', field: 'amountMinor', operator: 'gt', value: '100000' },
        { id: 's2', kind: 'approval', approverRole: 'kyc_approver', slaHours: 4 },
        { id: 's3', kind: 'action', action: 'notify', target: '#x', message: 'never reached' },
      ]),
      { amountMinor: 250_000 },
      'test',
      'evt_2',
    )
    expect(run.status).toBe('awaiting_approval')
    expect(run.steps.map((step) => step.outcome)).toEqual(['passed', 'awaiting_approval'])
    const tasks = db().flowTasks.filter((task) => task.status === 'open')
    expect(tasks.length).toBe(openBefore + 1)
    expect(tasks[0].flowRunId).toBe(run.id)
    expect(tasks[0].approverRole).toBe('kyc_approver')
  })

  it('executes actions when every condition holds', () => {
    const run = runFlow(
      flow([
        { id: 's1', kind: 'condition', field: 'entity', operator: 'eq', value: 'EU' },
        { id: 's2', kind: 'action', action: 'notify', target: '#ops', message: 'hello' },
      ]),
      { entity: 'EU' },
      'test',
      'evt_3',
    )
    expect(run.status).toBe('completed')
    expect(run.steps[1].outcome).toBe('executed')
  })

  it('records the context each step received and produced', () => {
    const sample = sampleEvents()['refund.created']
    const run = runFlow(
      flow([
        { id: 's1', kind: 'lookup', resource: 'refund', keyField: 'refundId', as: 'refund' },
        { id: 's2', kind: 'transform', assignments: [{ field: 'amountMajor', expression: '{{amountMinor}} / 100' }] },
        { id: 's3', kind: 'action', action: 'notify', target: '#ops', message: 'Refund {{refund.id}} is {{currency}} {{amountMajor}}' },
      ]),
      sample,
      'test',
      'evt_4',
      { mode: 'test' },
    )
    expect(run.mode).toBe('test')
    expect(run.steps[0].changed).toEqual(['refund'])
    const refund = run.steps[0].output.refund as Record<string, unknown>
    expect(refund.id).toBe(sample.refundId)
    expect(String(refund.customerEmail)).toContain('*')
    expect(run.steps[1].output.amountMajor).toBe(Number(sample.amountMinor) / 100)
    expect(run.steps[2].detail).toContain(`Refund ${String(sample.refundId)} is`)
    expect(run.output.notification).toBeDefined()
    expect(run.finishedAt).toBeDefined()
  })

  it('resumes after the approval gate and runs the remaining steps', () => {
    const run = runFlow(
      flow([
        { id: 's1', kind: 'approval', approverRole: 'kyc_approver', slaHours: 4 },
        { id: 's2', kind: 'action', action: 'notify', target: '#x', message: 'after approval' },
      ]),
      { amountMinor: 1 },
      'usr_bob',
      'evt_5',
    )
    const task = db().flowTasks.find((candidate) => candidate.flowRunId === run.id)
    if (!task) throw new Error('task missing')
    expect(task.stepId).toBe('s1')
    resumeRun(run, task, 'approved', 'hana', 'ok')
    expect(run.status).toBe('completed')
    expect(run.steps.map((step) => step.outcome)).toEqual(['executed', 'executed'])
    expect(run.steps[1].input.approval).toMatchObject({ decision: 'approved' })
  })

  it('evaluates arithmetic safely and never executes code', () => {
    expect(evaluateExpression('({{a}} + 2) * 3', { a: 4 })).toBe(18)
    expect(evaluateExpression('{{a}}.toString()', { a: 4 })).toBe('4.toString()')
    expect(evaluateExpression('process.exit(1)', {})).toBe('process.exit(1)')
  })

  it('tests an unsaved definition without mutating the stored flow', () => {
    const stored = db().flows[0]
    const stepsBefore = JSON.stringify(stored.steps)
    const run = runFlow(stored, sampleEvents()[stored.trigger], 'test', 'evt_6', {
      mode: 'test',
      stepsOverride: [{ id: 'x', kind: 'action', action: 'notify', target: '#x', message: 'only this' }],
    })
    expect(run.steps.length).toBe(1)
    expect(JSON.stringify(stored.steps)).toBe(stepsBefore)
  })
})
