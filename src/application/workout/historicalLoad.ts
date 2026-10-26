import type { EquipmentSnapshot } from "../../domain/models";
import type { ExerciseHistoryResult } from "../history/exerciseHistory";
import { comparable_equipment } from "../gyms/equipmentProfiles";
import { is_training_set_completed } from "../../domain/rules/completion";

export function normalise_movement(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\bbb\b/g, "barbell")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export function portable_load(name: string, equipment = ""): boolean {
  const text = `${name} ${equipment}`.toLowerCase();
  return (
    !/machine|cable|smith|lever|plate.loaded/.test(text) &&
    /\bdumbbell\b|\bbarbell\b|\bdb\b|\bbb\b|\bez\b/.test(text)
  );
}
export interface HistoricalLoad {
  sets: {
    set_number: number;
    load_kg: number;
    reps: number | null;
    rpe: number | null;
  }[];
  uncertain: boolean;
  reason: string;
  date: string;
}
export function suggest_historical_load(
  history: ExerciseHistoryResult | undefined,
  sessionId: string,
  date: string,
  gym: string | null,
  equipment: EquipmentSnapshot | null,
): HistoricalLoad | null {
  if (!history) return null;
  const portable = portable_load(
    history.exercise.canonical_name,
    history.exercise.equipment ?? "",
  );
  const candidates = history.entries
    .flatMap((entry) => {
      if (
        entry.session.id === sessionId ||
        entry.session.status !== "completed" ||
        entry.session.deleted_at ||
        entry.session.session_date_local > date
      )
        return [];
      return entry.appearances.flatMap((a) => {
        if (a.session_exercise.deleted_at) return [];
        const sets = a.sets
          .filter(
            (s) =>
              is_training_set_completed(s) &&
              s.set_role === "work" &&
              s.load_type === "normal" &&
              s.rep_mode === "total" &&
              s.structure_type === "straight" &&
              s.load_kg !== null,
          )
          .sort((a, b) => a.set_number - b.set_number)
          .map((s) => ({
            set_number: s.set_number,
            load_kg: s.load_kg!,
            reps: s.completed_reps,
            rpe: s.rpe ?? a.metrics?.rpe ?? null,
          }));
        if (!sets.length) return [];
        const identity = history.resolved_exercise_ids.includes(
          a.session_exercise.exercise_id,
        );
        const exact =
          identity &&
          (portable ||
            comparable_equipment(
              equipment,
              a.session_exercise.equipment_snapshot,
            ));
        const sameGym = Boolean(gym && gym === entry.session.gym_profile_id);
        const stale =
          (Date.parse(date) - Date.parse(entry.session.session_date_local)) /
            86400000 >
          56;
        return [
          {
            sets,
            uncertain: !exact || stale,
            date: entry.session.session_date_local,
            rank: exact ? 0 : sameGym ? 1 : 2,
            reason: !identity
              ? "Name-matched history; check movement and load."
              : stale
                ? "Older history; use as a starting suggestion."
                : exact
                  ? portable
                    ? "Same free-weight movement; history carries across gyms."
                    : "Matched equipment and setup."
                  : sameGym
                    ? "Same gym; equipment/setup is unverified."
                    : "Transferred load: machine resistance may differ. Adjust after warming up.",
          },
        ];
      });
    })
    .sort((a, b) => a.rank - b.rank || b.date.localeCompare(a.date));
  return candidates[0] ?? null;
}
