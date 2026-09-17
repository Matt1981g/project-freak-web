import { expect, test } from '@playwright/test'

test('equipment attribution, repeat loading and manual confirmation complete without transaction errors', async ({ page }) => {
  await page.goto('./#/gyms')
  const trident = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Trident Gym Plymouth', exact: true }) })
  await trident.getByRole('button', { name: 'Edit equipment', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Trident Gym Plymouth equipment', exact: true })
  await expect(editor.getByText(/equipment profiles linked/)).toBeVisible()
  await page.reload()
  await trident.getByRole('button', { name: 'Edit equipment', exact: true }).click()
  await expect(editor.getByText(/equipment profiles linked/)).toBeVisible()
  await editor.getByRole('button', { name: 'Link equipment', exact: true }).first().click()
  await editor.getByRole('button', { name: 'Confirm equipment', exact: true }).click()
  await expect(page.getByText('Equipment profile saved. Past workouts are unchanged; new workouts will record this equipment.')).toBeVisible()
  await expect(page.getByText(/Transaction committed too early/)).toHaveCount(0)
})
