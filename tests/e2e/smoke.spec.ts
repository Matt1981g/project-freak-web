import { expect, test } from '@playwright/test'

test('boots PROJECT FREAK, registers the service worker and survives an offline reload', async ({ page, context }) => {
  await page.goto('./#/plan')
  await expect(page.getByText('PROJECT FREAK', { exact: true }).first()).toBeVisible()

  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    return Boolean(navigator.serviceWorker.controller)
  })

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByText('PROJECT FREAK', { exact: true }).first()).toBeVisible()
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
