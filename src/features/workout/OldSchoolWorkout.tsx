import { portable_load } from "../../application/workout/historicalLoad";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  load_live_workout,
  load_exercise_weight_unit_preferences,
  save_exercise_weight_unit_preference,
  complete_live_session_exercise,
  complete_live_workout,
  save_live_exercise_scores,
} from "../../app/projectFreakServices";
import { is_training_set_completed } from "../../domain/rules/completion";
import { SetLoggerRow } from "./WorkoutScreen";
import { select_set_load_prefill } from "../../application/workout/setLoadPrefill";
import { request_auto_sync } from "../../application/sync/autoSyncEvents";
import styles from "./OldSchoolWorkout.module.css";

type Workout = NonNullable<Awaited<ReturnType<typeof load_live_workout>>>;
type Entry = Workout["exercises"][number];

function ExerciseScores({
  entry,
  onDone,
}: {
  entry: Entry;
  onDone: () => Promise<void>;
}) {
  const [scores, setScores] = useState({
    pump: entry.metrics?.pump ?? null,
    enjoyment: entry.metrics?.enjoyment ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = useRef(scores);
  const chain = useRef(Promise.resolve());
  function change(key: "pump" | "enjoyment", value: number) {
    const next = { ...latest.current, [key]: value };
    latest.current = next;
    setScores(next);
    setBusy(true);
    chain.current = chain.current
      .then(async () => {
        await save_live_exercise_scores(entry.exercise.id, {
          ...next,
          rpe: entry.metrics?.rpe ?? null,
          form: entry.metrics?.form ?? null,
        });
        request_auto_sync("workout_completed");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  }
  async function done() {
    setBusy(true);
    setError("");
    try {
      await chain.current;
      await save_live_exercise_scores(entry.exercise.id, {
        ...latest.current,
        rpe: entry.metrics?.rpe ?? null,
        form: entry.metrics?.form ?? null,
      });
      await complete_live_session_exercise(entry.exercise);
      await onDone();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  return (
    <section className={styles.scores}>
      <h2>How did it feel?</h2>
      {(["pump", "enjoyment"] as const).map((key) => (
        <label className={styles.scoreSliderRow} key={key}>
          <span>{key === "pump" ? "Pump" : "Enjoyment"}: {scores[key] ?? "—"}</span>
          <input type="range" min="1" max="10" step="1"
            aria-label={key} value={scores[key] ?? 5}
            onChange={(event) => change(key, Number(event.target.value))} />
          <small>1 — 10</small>
        </label>
      ))}
      <button
        disabled={busy || scores.pump === null || scores.enjoyment === null}
        onClick={() => void done()}
      >
        Next exercise
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function OldSchoolWorkout() {
  const { completed_session_id } = useParams();
  const [workout, setWorkout] = useState<Workout>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [units, setUnits] = useState<Record<string, "kg" | "lb">>({});
  const [restStarted, setRestStarted] = useState<number | null>(null);
  const [restNow, setRestNow] = useState(Date.now());
  const [postponed, setPostponed] = useState<string[]>([]);
  useEffect(() => {
    void load_exercise_weight_unit_preferences().then(setUnits).catch(() => {});
  }, []);
  useEffect(() => {
    if (restStarted === null) return;
    const interval = window.setInterval(() => setRestNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [restStarted]);
  function changeUnit(id: string, unit: "kg" | "lb") {
    setUnits((current) => ({ ...current, [id]: unit }));
    void save_exercise_weight_unit_preference(id, unit).catch((cause) =>
      setError(String(cause)),
    );
  }
  const refresh = useCallback(async () => {
    if (!completed_session_id) return;
    const value = await load_live_workout(completed_session_id);
    if (!value) throw Error("Workout not found.");
    setWorkout(value);
  }, [completed_session_id]);
  useEffect(() => {
    let active = true;
    load_live_workout(completed_session_id ?? "")
      .then((w) => {
        if (active) {
          if (w) setWorkout(w);
          else setError("Workout not found.");
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [completed_session_id]);
  async function finish() {
    if (!workout) return;
    setBusy(true);
    try {
      await complete_live_workout(workout.session.id);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!workout) return <p role="status">{error || "Loading workout…"}</p>;
  const remaining = workout.exercises.filter((e) => !e.exercise.completed_at);
  const ordered = [
    ...remaining.filter((e) => !postponed.includes(e.exercise.id)),
    ...postponed.map((id) => remaining.find((e) => e.exercise.id === id)).filter(
      (e): e is Entry => Boolean(e),
    ),
  ];
  let entry = ordered[0];
  if (entry?.exercise.rotation_group_key && !postponed.length) {
    const group = entry.exercise.rotation_group_key;
    const pair = remaining.filter((e) => e.exercise.rotation_group_key === group);
    entry = [...pair].sort(
      (a, b) => a.sets.filter(is_training_set_completed).length -
        b.sets.filter(is_training_set_completed).length,
    )[0] ?? entry;
  }
  function postpone() {
    if (!entry || ordered.length < 2) return;
    setPostponed((current) => [
      ...current.filter((id) => id !== entry.exercise.id),
      entry.exercise.id,
    ]);
  }
  function nextExercise() {
    if (entry) setPostponed((current) =>
      current.filter((id) => id !== entry.exercise.id),
    );
    return refresh();
  }
  if (workout.session.status === "completed")
    return (
      <section className={styles.screen}>
        <h1>Workout complete</h1>
        <p>Saved. Good work.</p>
        <Link to="/plan">Back to plan</Link>
      </section>
    );
  if (!entry)
    return (
      <section className={styles.screen}>
        <h1>All exercises complete</h1>
        <button disabled={busy} onClick={() => void finish()}>
          Finish workout
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  const total = entry.planned_sets.length || entry.exercise.target_sets || 1;
  const next = Array.from({ length: total }, (_, i) => i + 1).find(
    (n) =>
      !entry.sets.some(
        (s) => s.set_number === n && is_training_set_completed(s),
      ),
  );
  const actual = entry.sets.find((s) => s.set_number === next) ?? null;
  const planned =
    entry.planned_sets.find((s) => s.set.set_number === next) ?? null;
  const previousActual = entry.sets.find(
    (s) => s.set_number === (next ?? 1) - 1 && is_training_set_completed(s),
  );
  const prefill = select_set_load_prefill({
    existing_set: actual,
    programmed_load_kg: planned?.set.target_load_kg ?? null,
    previous_completed_load_kg: previousActual?.load_kg,
    previous: entry.previous_comparable,
    progression: entry.progression_suggestion,
    set_number: next ?? 1,
    historical: entry.historical_load,
    intensity: workout.intensity,
  });
  const unverifiedProgramme =
    prefill.source === "programme" &&
    !portable_load(entry.exercise.exercise_name_snapshot) &&
    !planned?.set.equipment_snapshot?.comparable;
  const uncertain =
    unverifiedProgramme ||
    (prefill.source === "historical_suggestion" &&
      entry.historical_load?.uncertain);
  return (
    <section className={styles.screen} aria-label="Old School workout">
      <header>
        <small>
          {workout.session.session_name} ·{" "}
          {workout.exercises.indexOf(entry) + 1}/{workout.exercises.length}
        </small>
        <h1>{entry.exercise.exercise_name_snapshot}</h1>
        <p>
          {total} working sets · {entry.exercise.target_rep_min}–
          {entry.exercise.target_rep_max} reps · {workout.intensity} ·{" "}
          {workout.intensity === "recovery" ? "RPE 6–7, no failure" : "RPE 8–9"}
        </p>
        {entry.exercise.tempo && <small>Tempo {entry.exercise.tempo}</small>}
      </header>
      <div className={styles.toolbar}>
        <div className={styles.unitToggle}>
          <button type="button" aria-pressed={(units[entry.exercise.exercise_id] ?? "kg") === "kg"} onClick={() => changeUnit(entry.exercise.exercise_id, "kg")}>KG</button>
          <button type="button" aria-pressed={units[entry.exercise.exercise_id] === "lb"} onClick={() => changeUnit(entry.exercise.exercise_id, "lb")}>LBS</button>
        </div>
        {restStarted !== null && (
          <small aria-label="Elapsed rest">Rest {String(Math.floor(Math.max(0, restNow - restStarted) / 60000)).padStart(2, "0")}:{String(Math.floor(Math.max(0, restNow - restStarted) / 1000) % 60).padStart(2, "0")}</small>
        )}
        {ordered.length > 1 && (
          <button type="button" className={styles.postpone} onClick={postpone}>Postpone exercise</button>
        )}
      </div>
      {next && (
        <>
          <p className={uncertain ? styles.uncertain : styles.hint}>
            {unverifiedProgramme
              ? "Programme starting load; machine/setup is unverified. Check during warm-up."
              : prefill.source === "historical_suggestion"
                ? `${entry.historical_load?.date}: ${entry.historical_load?.reason}`
                : "Editable working load · record your actual reps and RPE"}
          </p>
          <SetLoggerRow
            key={`${entry.exercise.id}:${next}`}
            exercise={entry.exercise}
            set_number={next}
            planned_set={planned}
            actual_set={actual}
            actual_components={
              actual ? (entry.set_components_by_set_id[actual.id] ?? []) : []
            }
            initial_load_kg={prefill.load_kg}
            load_prefill_source={prefill.source}
            load_unit={units[entry.exercise.exercise_id] ?? "kg"}
            locked={false}
            require_rpe
            on_complete={async () => {
              setRestStarted(Date.now());
              setRestNow(Date.now());
              request_auto_sync("workout_completed");
              await refresh();
            }}
          />
        </>
      )}
      {!next && (
        <ExerciseScores
          key={entry.exercise.id}
          entry={entry}
          onDone={nextExercise}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <Link to="/plan">Back to plan · progress saved</Link>
    </section>
  );
}
