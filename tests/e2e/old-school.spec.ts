import { expect, test } from "@playwright/test";

async function waitForWorkoutStores(page: import("@playwright/test").Page) {
  // Do not let a direct indexedDB.open() create an empty database before
  // Dexie's asynchronous schema installation has completed.
  await page.waitForFunction(
    async () => {
      const databases = await indexedDB.databases();
      if (!databases.some((entry) => entry.name === "project-freak"))
        return false;

      return new Promise<boolean>((resolve) => {
        const request = indexedDB.open("project-freak");
        request.onerror = () => resolve(false);
        request.onsuccess = () => {
          const db = request.result;
          const ready = [
            "exercises",
            "completed_sessions",
            "session_exercises",
          ].every((store) => db.objectStoreNames.contains(store));
          db.close();
          resolve(ready);
        };
      });
    },
    undefined,
    { timeout: 15_000 },
  );
}

test("Old School saves RPE and exercise scores, recovers after reload, and has no timers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/plan");
  await waitForWorkoutStores(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("project-freak");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const tx = db.transaction(
      ["exercises", "completed_sessions", "session_exercises"],
      "readwrite",
    );
    const now = new Date().toISOString();
    const mutable = {
      created_at: now,
      updated_at: now,
      deleted_at: null,
      revision: 1,
      device_id: "e2e-device",
      source_kind: "user",
      source_id: null,
    };

    for (const exercise of [
      { id: "e2e-rest-a", name: "E2E First Curl" },
      { id: "e2e-rest-b", name: "E2E Next Curl" },
    ]) {
      tx.objectStore("exercises").put({
        ...mutable,
        id: exercise.id,
        canonical_name: exercise.name,
        short_name: null,
        category: "Biceps",
        equipment: "Machine",
        default_load_type: "normal",
        rep_mode_default: "total",
        archived_at: null,
        notes: null,
      });
    }

    tx.objectStore("completed_sessions").put({
      ...mutable,
      id: "e2e-rest-session",
      programmed_session_id: null,
      programme_block_id: null,
      workout_template_id_snapshot: null,
      legacy_workout_id: null,
      session_name: "E2E Rest Transition",
      session_date_local: new Date().toISOString().slice(0, 10),
      timezone: "Europe/London",
      status: "in_progress",
      started_at: now,
      completed_at: null,
      source_start_text: null,
      source_finish_text: null,
      duration_seconds: null,
      notes: null,
    });

    for (const entry of [
      {
        id: "e2e-rest-sx-a",
        exercise_id: "e2e-rest-a",
        name: "E2E First Curl",
        order: 1,
        rest_seconds: 60,
      },
      {
        id: "e2e-rest-sx-b",
        exercise_id: "e2e-rest-b",
        name: "E2E Next Curl",
        order: 2,
        rest_seconds: 0,
      },
    ]) {
      tx.objectStore("session_exercises").put({
        ...mutable,
        id: entry.id,
        completed_session_id: "e2e-rest-session",
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
        technique_cue: "Controlled reps.",
        programme_notes: null,
        started_at: null,
        completed_at: null,
        notes: null,
      });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });

  await page.goto("./#/workout/e2e-rest-session");
  await expect(
    page.getByRole("region", { name: "Old School workout" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Interface mode" }),
  ).toHaveValue("old-school");
  await page.locator("#load-e2e-rest-sx-a-1").fill("35");
  await page.locator("#reps-e2e-rest-sx-a-1").fill("10");
  await page.locator("#rpe-e2e-rest-sx-a-1").selectOption("8");
  await page.reload();
  await expect(page.locator("#load-e2e-rest-sx-a-1")).toHaveValue("35");
  await expect(page.locator("#reps-e2e-rest-sx-a-1")).toHaveValue("10");
  await expect(page.locator("#rpe-e2e-rest-sx-a-1")).toHaveValue("8");
  await page.getByRole("button", { name: "COMPLETE SET", exact: true }).click();
  await page.getByLabel("pump", { exact: true }).selectOption("9");
  await page.getByLabel("enjoyment", { exact: true }).selectOption("10");
  await page.getByRole("button", { name: "Next exercise" }).click();
  await expect(
    page.getByRole("heading", { name: "E2E Next Curl" }),
  ).toBeVisible();
  await expect(page.getByText("REST TIMER", { exact: true })).toHaveCount(0);
  await expect(page.getByText("READINESS", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "Interface mode" })
    .selectOption("analytics");
  await expect(
    page.getByRole("button", { name: /E2E First Curl/ }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Interface mode" })
    .selectOption("old-school");
  await expect(
    page.getByRole("heading", { name: "E2E Next Curl" }),
  ).toBeVisible();
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("project-freak");
      r.onsuccess = () => resolve(r.result);
    });
    const read = (table: string) =>
      new Promise<unknown[]>((resolve) => {
        const r = db.transaction(table).objectStore(table).getAll();
        r.onsuccess = () => resolve(r.result);
      });
    const metrics = await read("exercise_metrics"),
      sets = await read("sets");
    db.close();
    return { metrics, sets };
  });
  expect(saved.metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ pump: 9, enjoyment: 10 }),
    ]),
  );
  expect(saved.sets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ load_kg: 35, completed_reps: 10, rpe: 8 }),
    ]),
  );
});
