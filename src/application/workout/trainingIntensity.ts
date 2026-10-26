import type { ProgrammedSessionDetail } from "../../data/repositories/contracts";
export type TrainingIntensity = "normal" | "freak" | "recovery";
export function resolve_intensity(text: string): TrainingIntensity {
  const explicit = text
    .match(/PF_INTENSITY:(normal|freak|recovery)/i)?.[1]
    ?.toLowerCase();
  if (explicit) return explicit as TrainingIntensity;
  return /light|recovery|deload/i.test(text)
    ? "recovery"
    : /freak mode/i.test(text)
      ? "freak"
      : "normal";
}
export function selected_intensity(fallback: string): TrainingIntensity {
  try {
    const v = localStorage.getItem("project-freak:training-intensity");
    if (v === "normal" || v === "freak" || v === "recovery") return v;
  } catch {
    /* use programme */
  }
  return resolve_intensity(fallback);
}
export function intensity_prescription(
  detail: ProgrammedSessionDetail,
  mode: TrainingIntensity,
): ProgrammedSessionDetail {
  // Derive from the original programme each time; never compound a reduction on resume.
  const budget = /saturday/i.test(detail.session.name_snapshot) ? 30 : 24;
  const plannedTotal = detail.exercises.reduce(
    (n, e) => n + (e.sets.length || e.exercise.target_sets || 3),
    0,
  );
  let extraBudget = Math.max(0, budget - plannedTotal);
  return {
    ...detail,
    exercises: detail.exercises.map((item) => {
      const base = item.sets.length || item.exercise.target_sets || 3;
      const desired =
        mode === "recovery"
          ? Math.max(1, Math.ceil(base * 0.6))
          : mode === "freak"
            ? Math.max(base, Math.min(4, base + 1))
            : Math.max(3, base);
      const count =
        desired > base ? base + Math.min(desired - base, extraBudget) : desired;
      extraBudget -= Math.max(0, count - base);
      const min =
        mode === "recovery"
          ? Math.max(10, item.exercise.target_rep_min ?? 10)
          : item.exercise.target_rep_min;
      const max =
        mode === "recovery"
          ? Math.max(15, item.exercise.target_rep_max ?? 15)
          : item.exercise.target_rep_max;
      const sets = Array.from({ length: count }, (_, i) => {
        const source = item.sets[Math.min(i, item.sets.length - 1)];
        if (!source) return null;
        const extra = i >= item.sets.length;
        return {
          ...source,
          components: mode === "recovery" || extra ? [] : source.components,
          set: {
            ...source.set,
            id: extra ? `${source.set.id}:intensity:${i + 1}` : source.set.id,
            set_number: i + 1,
            target_rep_min:
              mode === "recovery" ? min : source.set.target_rep_min,
            target_rep_max:
              mode === "recovery" ? max : source.set.target_rep_max,
            structure_type:
              mode === "recovery" || extra
                ? ("straight" as const)
                : source.set.structure_type,
            failure_target:
              mode === "recovery"
                ? ("none" as const)
                : source.set.failure_target,
            target_load_kg:
              source.set.target_load_kg === null
                ? null
                : mode === "recovery"
                  ? Math.floor((source.set.target_load_kg * 0.85) / 1.25) * 1.25
                  : source.set.target_load_kg,
          },
        };
      }).filter((v): v is NonNullable<typeof v> => v !== null);
      return {
        ...item,
        exercise: {
          ...item.exercise,
          target_sets: count,
          target_rep_min: min,
          target_rep_max: max,
        },
        sets,
      };
    }),
  };
}
