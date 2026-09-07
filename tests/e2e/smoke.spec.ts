import { expect, test } from '@playwright/test'

test('boots PROJECT FREAK, registers the service worker and survives an offline reload', async ({ page, context }) => {
  await page.goto('./#/plan')
  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()

  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    return true
  })

  // First registration does not control the page that created it. Reload once
  // online so the service worker owns the client, then prove a cold offline
  // navigation can still render the application shell.
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()
  await context.setOffline(false)
})

test('core navigation remains usable in the browser shell', async ({ page }) => {
  await page.goto('./#/plan')
  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()

  const history = page.getByRole('link', { name: 'HISTORY' }).first()
  await history.click()
  await expect(page).toHaveURL(/#\/history/)

  const analysis = page.getByRole('link', { name: 'ANALYSIS' }).first()
  await analysis.click()
  await expect(page).toHaveURL(/#\/analysis/)
})
