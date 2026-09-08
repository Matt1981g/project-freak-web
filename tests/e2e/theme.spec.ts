import { expect, test } from '@playwright/test'

async function expectApprovedBackground(page: import('@playwright/test').Page) {
  await page.goto('./#/plan')
  const shell = page.locator('.app-shell')
  await expect(shell).toHaveAttribute('data-theme', 'approved-background-v1')
  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()

  const theme = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const shellStyle = getComputedStyle(document.querySelector('.app-shell')!)
    return {
      background: root.getPropertyValue('--pf-bg').trim(),
      panel: root.getPropertyValue('--pf-panel').trim(),
      accent: root.getPropertyValue('--pf-accent').trim(),
      orange: root.getPropertyValue('--pf-orange').trim(),
      text: root.getPropertyValue('--pf-text').trim(),
      shellBackground: shellStyle.backgroundImage,
      approvedBackground: getComputedStyle(document.querySelector('.app-shell')!, '::before').backgroundImage,
      readabilityVeil: getComputedStyle(document.querySelector('.app-shell')!, '::after').backgroundImage,
    }
  })

  expect(theme.background).toBe('#080807')
  expect(theme.panel).toBe('#10100e')
  expect(theme.accent).toBe('#c6ff00')
  expect(theme.orange).toBe('#ff6a00')
  expect(theme.text).toBe('#d8e1cf')
  expect(theme.shellBackground).toContain('radial-gradient')
  expect(theme.shellBackground).toContain('linear-gradient')
  expect(theme.approvedBackground).toContain('data:image/webp;base64')
  expect(theme.readabilityVeil).toContain('linear-gradient')
}

test('approved PF background renders on desktop', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expectApprovedBackground(page)
  await page.screenshot({
    path: testInfo.outputPath('pf-approved-bg-desktop.png'),
    fullPage: true,
  })
})

test('approved PF background renders at phone width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await expectApprovedBackground(page)
  await page.screenshot({
    path: testInfo.outputPath('pf-approved-bg-phone.png'),
    fullPage: true,
  })
})
