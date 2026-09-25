import { test, expect, Page } from '@playwright/test'

/** Switch demo persona via the session endpoint (same path the identity chip uses). */
async function as(page: Page, userId: string) {
  const res = await page.context().request.post('/api/session', { data: { userId } })
  if (!res.ok()) throw new Error(`session switch to ${userId} failed: ${res.status()}`)
}

test('refund decision is notes-gated and the API returns awaitingRoles', async ({ page }) => {
  await as(page, 'usr_bob')
  await page.goto('/')
  const row = page.locator('tr', { hasText: 'Awaiting' }).filter({ has: page.getByPlaceholder('Decision rationale (mandatory)') }).first()
  await expect(row).toBeVisible()
  const approve = row.getByRole('button', { name: 'Approve' })
  await expect(approve).toBeDisabled()
  await row.getByPlaceholder('Decision rationale (mandatory)').fill('Approved — verified in CRM and ledger')
  await expect(approve).toBeEnabled()
  const responsePromise = page.waitForResponse((r) => r.url().includes('/decision') && r.request().method() === 'POST')
  await approve.click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  const body = (await response.json()) as { awaitingRoles?: string[] }
  expect(Array.isArray(body.awaitingRoles)).toBe(true)
  await expect(page.getByText('Decision written to the audit chain').first()).toBeVisible()
})

test('viewer persona sees masked PII, auditor sees unmasked', async ({ page }) => {
  await as(page, 'usr_frank')
  await page.goto('/')
  await expect(page.getByRole('cell').filter({ hasText: /\*{3,}/ }).first()).toBeVisible()
  await expect(page.getByRole('cell').filter({ hasText: 'John Smith' })).toHaveCount(0)

  await as(page, 'usr_eva')
  await page.goto('/')
  await expect(page.getByRole('cell').filter({ hasText: 'John Smith' }).first()).toBeVisible()
})

test('audit-logs URL params hydrate filters and filter server-side', async ({ page }) => {
  await as(page, 'usr_bob')
  const filtered = page.waitForResponse((r) => r.url().includes('/api/audit') && r.url().includes('outcome=deny'))
  await page.goto('/audit-logs?outcome=deny')
  await filtered
  const outcomeSelect = page.locator('select', { has: page.locator('option', { hasText: 'deny' }) })
  await expect(outcomeSelect).toHaveValue('deny')
  const badges = page.locator('td').getByText('deny', { exact: true })
  await expect(badges.first()).toBeVisible()
})

test('compliance page renders control register', async ({ page }) => {
  await as(page, 'usr_bob')
  await page.goto('/compliance')
  await expect(page.getByText(/SOC 2|PCI DSS|DORA|GDPR/).first()).toBeVisible()
  await expect(page.getByText(/segregation|SoD/i).first()).toBeVisible()
})

test('data connections page shows governed connectors', async ({ page }) => {
  await as(page, 'usr_bob')
  await page.goto('/data-connections')
  await expect(page.getByText('Core Ledger CDC')).toBeVisible()
  await expect(page.getByText('PSP Webhooks')).toBeVisible()
})

test('flow test run executes steps and pauses at the approval gate; approver resumes it', async ({ page }) => {
  await as(page, 'usr_bob')
  await page.goto('/studio/flows')
  await page.getByRole('button', { name: /High-value refund escalation/ }).click()

  const editor = page.locator('textarea.font-mono').first()
  const sample = JSON.parse(await editor.inputValue()) as Record<string, unknown>
  sample.amountMinor = 250000
  await editor.fill(JSON.stringify(sample, null, 2))
  await page.getByRole('button', { name: /^Test$/ }).click()

  await expect(page.getByText(/awaiting approval/i).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/PII masked/i).first()).toBeVisible()

  // malformed JSON disables Test; repairing re-enables it
  await editor.fill('{ "amountMinor": }')
  await expect(page.getByText(/Invalid JSON/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Test$/ })).toBeDisabled()

  // approver persona sees the task in the inbox and resumes the run
  await as(page, 'usr_hana')
  await page.goto('/studio/flows')
  const task = page.locator('div', { hasText: 'High-value refund escalation: approval required' }).filter({ has: page.getByPlaceholder('Decision notes (required)') }).last()
  await expect(task).toBeVisible()
  await task.getByPlaceholder('Decision notes (required)').fill('Compliance sign-off — sanctions clear')
  const approveResp = page.waitForResponse((r) => r.url().includes('/api/studio/tasks/') && r.request().method() === 'POST')
  await task.getByRole('button', { name: 'Approve' }).click()
  await approveResp
  await expect(page.getByText(/Task approved — the run resumed/i)).toBeVisible()
})

test('document uploader is permission-gated and uploads for a KYC reviewer', async ({ page }) => {
  await as(page, 'usr_bob')
  await page.goto('/studio')
  await expect(page.getByText('needs kyc:document_upload').first()).toBeVisible()

  await as(page, 'usr_grace')
  await page.goto('/studio')
  const dropZone = page.locator('div', { hasText: 'Drop evidence' }).first()
  await dropZone.locator('input[type="file"]').setInputFiles('e2e/fixtures/proof-of-address.pdf')
  await expect(page.getByText(/SHA-256/i).first()).toBeVisible({ timeout: 15_000 })
})
