import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('project-freak:interface-mode', 'analytics')) })

test('equipment attribution, repeat loading and manual confirmation complete without transaction errors', async ({ page }) => {
  await page.goto('./#/gyms')
  const jacksons = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Jacksons', exact: true }) })
  await jacksons.getByRole('button', { name: 'Edit equipment', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Jacksons equipment', exact: true })
  await expect(editor.getByText(/equipment profiles linked/)).toBeVisible()
  // Fresh databases have no Jacksons machines yet; create one to exercise persistence.
  await editor.getByRole('button', { name: 'Add new machine / exercise' }).click()
  await editor.getByRole('textbox', { name: 'Machine / exercise name (required)' }).fill('Test Cable Curl')
  await editor.getByRole('button', { name: 'Save to Jacksons' }).click()
  await expect(editor.getByRole('button', { name: 'Link equipment', exact: true }).first()).toBeVisible()
  await page.reload()
  await jacksons.getByRole('button', { name: 'Edit equipment', exact: true }).click()
  await expect(editor.getByText(/equipment profiles linked/)).toBeVisible()
  await editor.getByRole('button', { name: 'Link equipment', exact: true }).first().click()
  await editor.getByRole('button', { name: 'Confirm equipment', exact: true }).click()
  await expect(page.getByText('Equipment profile saved. Past workouts are unchanged; new workouts will record this equipment.')).toBeVisible()
  await expect(page.getByText(/Transaction committed too early/)).toHaveCount(0)
})


test('PF19.1 keeps the gym editor mounted during repeated incoming sync notifications', async ({ page }) => {
  await page.goto('./#/gyms')
  const gym = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Jacksons', exact: true }),
  })
  await gym.getByRole('button', { name: 'Edit equipment', exact: true }).click()

  const editor = page.getByRole('region', { name: 'Jacksons equipment', exact: true })
  const search = editor.getByRole('textbox', { name: 'Search equipment or exercise' })
  await search.fill('cable row')
  await expect(editor).toBeVisible()

  // Simulate multiple Supabase pull notifications. Before PF19.1 this changed
  // the Routes key, unmounted Gym Profiles and destroyed the active editor.
  await page.evaluate(async () => {
    for (let i = 0; i < 5; i += 1) {
      window.dispatchEvent(new CustomEvent('project-freak:auto-sync-complete', {
        detail: { reason: 'foreground_interval', result: { applied: 1 } },
      }))
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
  })

  await expect(page).toHaveURL(/#\/gyms/)
  await expect(editor).toBeVisible()
  await expect(search).toHaveValue('cable row')
  await expect(page.getByRole('dialog', { name: /TODAY.S PROGRAMMED SESSION/i })).toHaveCount(0)
})
