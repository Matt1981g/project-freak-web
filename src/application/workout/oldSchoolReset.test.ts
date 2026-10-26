import { describe, it, expect } from "vitest";
import type { ExerciseHistoryResult } from "../history/exerciseHistory";
import type { ProgrammedSessionDetail } from "../../data/repositories/contracts";
import {
  normalise_movement,
  portable_load,
  suggest_historical_load,
} from "./historicalLoad";
import { intensity_prescription } from "./trainingIntensity";
import { select_set_load_prefill } from "./setLoadPrefill";
import { build_progression_suggestion } from "./progressionSuggestion";
function history(
  name = "Dumbbell Curl",
  gym: string | null = "old",
): ExerciseHistoryResult {
  return {
    exercise: { canonical_name: name, equipment: null },
    resolved_exercise_ids: ["curl"],
    entries: [
      {
        session: {
          id: "past",
          status: "completed",
          deleted_at: null,
          session_date_local: "2026-10-20",
          gym_profile_id: gym,
        },
        appearances: [
          {
            session_exercise: { exercise_id: "curl", deleted_at: null },
            sets: [
              {
                id: "set",
                deleted_at: null,
                completed_at: "2026-10-20T10:00:00Z",
                set_role: "work",
                load_type: "normal",
                structure_type: "straight",
                rep_mode: "total",
                set_number: 1,
                load_kg: 20,
                completed_reps: 12,
                rpe: 8,
              },
            ],
            metrics: undefined,
          },
        ],
      },
    ],
  } as unknown as ExerciseHistoryResult;
}
describe("Old School historical load evidence", () => {
  it("keeps dumbbell loads across gyms and absent historical gym metadata", () => {
    for (const gym of ["old", null]) {
      const result = suggest_historical_load(
        history("Dumbbell Curl", gym),
        "today",
        "2026-10-26",
        "jacksons",
        null,
      );
      expect(result?.sets[0].load_kg).toBe(20);
      expect(result?.uncertain).toBe(false);
    }
  });
  it("marks machine transfers and unknown setups uncertain", () => {
    const result = suggest_historical_load(
      history("Cable Curl"),
      "today",
      "2026-10-26",
      "jacksons",
      null,
    );
    expect(result?.uncertain).toBe(true);
    expect(result?.reason).toContain("Transferred");
  });
  it("never treats a Smith barbell as portable", () => {
    expect(portable_load("Smith barbell squat")).toBe(false);
    expect(normalise_movement(" DB  Curl ")).toBe("dumbbell curl");
  });
  it("does not use future sessions and marks old history uncertain", () => {
    expect(
      suggest_historical_load(history(), "now", "2026-09-01", "jacksons", null),
    ).toBeNull();
    expect(
      suggest_historical_load(history(), "now", "2027-01-01", "jacksons", null)
        ?.uncertain,
    ).toBe(true);
  });
  it("prefills during calibration, adjusts recovery, and preserves a saved actual", () => {
    const h = suggest_historical_load(
      history(),
      "now",
      "2026-10-26",
      "jacksons",
      null,
    );
    const input = {
      existing_set: null,
      programmed_load_kg: null,
      previous: null,
      progression: build_progression_suggestion(null, []),
      set_number: 3,
      historical: h,
    };
    expect(select_set_load_prefill(input).load_kg).toBe(20);
    expect(
      select_set_load_prefill({ ...input, intensity: "recovery" }).load_kg,
    ).toBe(16.25);
    expect(
      select_set_load_prefill({
        ...input,
        previous_completed_load_kg: 17.5,
        intensity: "recovery",
      }).load_kg,
    ).toBe(17.5);
  });
});
describe("automatic intensity prescriptions", () => {
  const detail = {
    session: { name_snapshot: "Tuesday" },
    exercises: [
      {
        exercise: { target_sets: 3, target_rep_min: 8, target_rep_max: 12 },
        sets: Array.from({ length: 3 }, (_, i) => ({
          set: {
            id: `s${i}`,
            set_number: i + 1,
            target_load_kg: 40,
            target_rep_min: 8,
            target_rep_max: 12,
            structure_type: "straight",
            failure_target: "allowed",
          },
          components: [],
        })),
      },
    ],
  } as unknown as ProgrammedSessionDetail;
  it("uses different volume and effort for Normal, FREAK and Recovery without mutating source", () => {
    expect(
      intensity_prescription(detail, "normal").exercises[0].sets,
    ).toHaveLength(3);
    expect(
      intensity_prescription(detail, "freak").exercises[0].sets,
    ).toHaveLength(4);
    const light = intensity_prescription(detail, "recovery").exercises[0];
    expect(light.sets).toHaveLength(2);
    expect(light.sets[0].set.target_load_kg).toBe(33.75);
    expect(light.sets[0].set.failure_target).toBe("none");
    expect(detail.exercises[0].sets[0].set.target_load_kg).toBe(40);
  });
});

it("preserves sync-conflict evidence in backup validation", async () => {
  const { validate_backup_record } = await import(
    "../backup/backupRecordValidation"
  );
  expect(() =>
    validate_backup_record(
      "audit_events",
      {
        id: "conflict",
        entity_type: "set",
        entity_id: "s",
        action: "sync_conflict",
        before_json: { load_kg: 20 },
        after_json: { load_kg: 22 },
        reason: "Both versions retained",
        device_id: "test",
        created_at: "2026-10-26T10:00:00Z",
      },
      1,
    ),
  ).not.toThrow();
});
