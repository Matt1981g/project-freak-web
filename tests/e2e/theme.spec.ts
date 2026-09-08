import { expect, test } from '@playwright/test'

async function expectBronzeTheme(page: import('@playwright/test').Page) {
  await page.goto('./#/plan')
  const shell = page.locator('.app-shell')
  await expect(shell).toHaveAttribute('data-theme', 'bronze-cast-v1')
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
    }
  })

  expect(theme.background).toBe('#120c08')
  expect(theme.panel).toBe('#18120e')
  expect(theme.accent).toBe('#c6ff00')
  expect(theme.orange).toBe('#ff6a00')
  expect(theme.text).toBe('#c8e99b')
  expect(theme.shellBackground).toContain('radial-gradient')
  expect(theme.shellBackground).toContain('linear-gradient')
}

test('bronze cast theme renders on desktop', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expectBronzeTheme(page)
  await page.screenshot({
    path: testInfo.outputPath('pf-bronze-cast-desktop.png'),
    fullPage: true,
  })
})

test('bronze cast theme renders at phone width', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await expectBronzeTheme(page)
  await page.screenshot({
    path: testInfo.outputPath('pf-bronze-cast-phone.png'),
    fullPage: true,
  })
})
