import { expect, test } from '@playwright/test'

test('boots PROJECT FREAK, registers the service worker and survives an offline reload', async ({ page, context }) => {
  await page.goto('./#/plan')
  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()

  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    return true
  })

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

test('final-set rest survives reload and preserves the next-exercise transition', async ({ page }) => {
  await page.goto('./#/plan')
  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('project-freak')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const tx = db.transaction(
      ['exercises', 'completed_sessions', 'session_exercises'],
      'readwrite',
    )
    const now = new Date().toISOString()
    const mutable = {
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      device_id: 'e2e-device',
      source_kind: 'user',
      source_id: null,
    }

    for (const exercise of [
      { id: 'e2e-rest-a', name: 'E2E First Curl' },
      { id: 'e2e-rest-b', name: 'E2E Next Curl' },
    ]) {
      tx.objectStore('exercises').put({
        ...mutable,
        id: exercise.id,
        canonical_name: exercise.name,
        short_name: null,
        category: 'Biceps',
        equipment: 'Machine',
        default_load_type: 'normal',
        rep_mode_default: 'total',
        archived_at: null,
        notes: null,
      })
    }

    tx.objectStore('completed_sessions').put({
      ...mutable,
      id: 'e2e-rest-session',
      programmed_session_id: null,
      programme_block_id: null,
      workout_template_id_snapshot: null,
      legacy_workout_id: null,
      session_name: 'E2E Rest Transition',
      session_date_local: new Date().toISOString().slice(0, 10),
      timezone: 'Europe/London',
      status: 'in_progress',
      started_at: now,
      completed_at: null,
      source_start_text: null,
      source_finish_text: null,
      duration_seconds: null,
      notes: null,
    })

    for (const entry of [
      {
        id: 'e2e-rest-sx-a',
        exercise_id: 'e2e-rest-a',
        name: 'E2E First Curl',
        order: 1,
        rest_seconds: 60,
      },
      {
        id: 'e2e-rest-sx-b',
        exercise_id: 'e2e-rest-b',
        name: 'E2E Next Curl',
        order: 2,
        rest_seconds: 0,
      },
    ]) {
      tx.objectStore('session_exercises').put({
        ...mutable,
        id: entry.id,
        completed_session_id: 'e2e-rest-session',
        programmed_session_exercise_id: null,
        exercise_id: entry.exercise_id,
        exercise_name_snapshot: entry.name,
        planned_order: entry.order,
        actual_order: entry.order,
        rotation_group_key: null,
        rotation_position: null,
        target_sets: 1,
        target_rep_min: 8,
        target_rep_max: 12,
        rest_seconds: entry.rest_seconds,
        tempo: null,
        technique_cue: 'Controlled reps.',
        programme_notes: null,
        started_at: null,
        completed_at: null,
        notes: null,
      })
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  })

  await page.goto('./#/workout/e2e-rest-session')
  await page.getByRole('button', { name: /E2E First Curl/ }).click()
  await page.locator('#load-e2e-rest-sx-a-1').fill('35')
  await page.locator('#reps-e2e-rest-sx-a-1').fill('10')
  await page.getByRole('button', { name: 'COMPLETE SET' }).click()

  await expect(page.getByText('REST TIMER', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByText('SET COMPLETE', { exact: true })).toBeVisible()
  await expect(page.getByText('REST TIMER', { exact: true })).toBeVisible()

  await page.evaluate(() => {
    const key = 'project-freak:rest-timer:e2e-rest-session'
    const raw = localStorage.getItem(key)
    if (!raw) throw new Error('Expected persisted rest timer.')
    const timer = JSON.parse(raw) as { ends_at_ms: number | null }
    timer.ends_at_ms = Date.now() - 1_000
    localStorage.setItem(key, JSON.stringify(timer))
  })
  await page.reload()

  await expect(page.getByText('REST COMPLETE', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Rate and complete the current exercise to continue', {
      exact: true,
    }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'COMPLETE EXERCISE' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('NEXT EXERCISE', { exact: true })).toBeVisible()
  await expect(page.getByText('E2E Next Curl', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'START NEXT EXERCISE' }).click()
  await expect(page.locator('#load-e2e-rest-sx-b-1')).toBeVisible()
})

test('live workout survives the critical set-to-finish lifecycle', async ({ page }) => {
  await page.goto('./#/plan')
  await expect(page.getByText('Current programme', { exact: true })).toBeVisible()

  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('project-freak')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const tx = db.transaction(
      ['exercises', 'completed_sessions', 'session_exercises'],
      'readwrite',
    )
    const now = new Date().toISOString()
    const mutable = {
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      device_id: 'e2e-device',
      source_kind: 'user',
      source_id: null,
    }

    tx.objectStore('exercises').put({
      ...mutable,
      id: 'e2e-exercise',
      canonical_name: 'E2E Curl',
      short_name: null,
      category: 'Biceps',
      equipment: 'Machine',
      default_load_type: 'normal',
      rep_mode_default: 'total',
      archived_at: null,
      notes: null,
    })

    tx.objectStore('completed_sessions').put({
      ...mutable,
      id: 'e2e-session',
      programmed_session_id: null,
      programme_block_id: null,
      workout_template_id_snapshot: null,
      legacy_workout_id: null,
      session_name: 'E2E Workout',
      session_date_local: new Date().toISOString().slice(0, 10),
      timezone: 'Europe/London',
      status: 'in_progress',
      started_at: now,
      completed_at: null,
      source_start_text: null,
      source_finish_text: null,
      duration_seconds: null,
      notes: null,
    })

    tx.objectStore('session_exercises').put({
      ...mutable,
      id: 'e2e-sx',
      completed_session_id: 'e2e-session',
      programmed_session_exercise_id: null,
      exercise_id: 'e2e-exercise',
      exercise_name_snapshot: 'E2E Curl',
      planned_order: 1,
      actual_order: 1,
      rotation_group_key: null,
      rotation_position: null,
      target_sets: 1,
      target_rep_min: 8,
      target_rep_max: 12,
      rest_seconds: 0,
      tempo: null,
      technique_cue: 'Controlled reps.',
      programme_notes: null,
      started_at: now,
      completed_at: null,
      notes: null,
    })

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    db.close()
  })

  await page.goto('./#/workout/e2e-session')
  await expect(page.getByText('E2E Workout', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /E2E Curl/ }).click()
  await page.locator('#load-e2e-sx-1').fill('40')
  await page.locator('#reps-e2e-sx-1').fill('10')
  await page.getByRole('button', { name: 'COMPLETE SET' }).click()

  await expect(page.getByRole('button', { name: 'COMPLETE EXERCISE' })).toBeVisible()
  await page.getByRole('button', { name: 'COMPLETE EXERCISE' }).click()

  await expect(page.getByRole('button', { name: 'FINISH WORKOUT' })).toBeVisible()
  await page.getByRole('button', { name: 'FINISH WORKOUT' }).click()

  await expect(page.getByText('WORKOUT COMPLETE', { exact: true })).toBeVisible()
  await expect(page.getByText('400 kg', { exact: true })).toBeVisible()
})
