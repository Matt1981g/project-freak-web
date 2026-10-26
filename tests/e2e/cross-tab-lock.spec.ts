import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('project-freak:interface-mode', 'analytics')) })

const LOCK_NAME = 'project-freak:dataset-operation:project-freak'

test('two live PF tabs cannot hold a data-operation lock simultaneously', async ({ page, context }) => {
  await page.goto('./#/plan')
  const second = await context.newPage()
  await second.goto('./#/plan')

  const supported = await page.evaluate(
    () => typeof navigator.locks?.request === 'function',
  )
  expect(supported).toBe(true)

  // Begin an exclusive lock without waiting for release. This runs on the
  // real browser lock manager, not the in-memory unit-test implementation.
  await page.evaluate((name) => {
    const state = window as typeof window & {
      pfReleaseLock?: () => void
      pfLockHeld?: boolean
    }
    void navigator.locks.request(
      name,
      { mode: 'exclusive' },
      async () => {
        state.pfLockHeld = true
        await new Promise<void>((resolve) => { state.pfReleaseLock = resolve })
      },
    )
  }, LOCK_NAME)

  try {
    await page.waitForFunction(() =>
      (window as typeof window & { pfLockHeld?: boolean }).pfLockHeld === true,
    )

    const blocked = await second.evaluate(async (name) =>
      navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => lock === null),
      LOCK_NAME,
    )
    expect(blocked).toBe(true)
  } finally {
    await page.evaluate(() => {
      (window as typeof window & { pfReleaseLock?: () => void }).pfReleaseLock?.()
    })
  }

  await expect.poll(async () => second.evaluate(async (name) =>
    navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => lock !== null),
    LOCK_NAME,
  )).toBe(true)
})


test('each loaded PF tab holds a shared lease that denies exclusive restoration', async ({ page, context }) => {
  const APP_LOCK = 'project-freak:open-app:project-freak'
  await page.goto('./#/plan')
  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()
  const second = await context.newPage()
  await second.goto('./#/plan')
  await expect(second.getByText('Current programme', { exact: true })).toBeVisible()

  // Both actual app instances must be holding their shared dataset leases.
  for (const tab of [page, second]) {
    const refused = await tab.evaluate(async (name) =>
      navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => lock === null),
      APP_LOCK,
    )
    expect(refused).toBe(true)
  }

  // Closing just one tab cannot remove the other tab's protection.
  await second.close()
  await expect.poll(() => page.evaluate(async (name) =>
    navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => lock === null),
    APP_LOCK,
  )).toBe(true)
})
