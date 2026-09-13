from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


workout_path = Path("src/features/workout/WorkoutScreen.tsx")
text = workout_path.read_text()

text = replace_once(
    text,
    "  load_exercise_weight_unit_preferences,\n  load_live_workout,",
    "  load_exercise_weight_unit_preferences,\n  load_gym_equipment,\n  load_live_workout,",
    "add load_gym_equipment import",
)

text = replace_once(
    text,
    "} from '../../app/projectFreakServices'\nimport {\n  pause_rest_timer,",
    "} from '../../app/projectFreakServices'\nimport { save_gym_machine_identity } from '../../app/gymMachineDetailsService'\nimport {\n  pause_rest_timer,",
    "add setup-note save service import",
)

text = replace_once(
    text,
    "  const [substituting, setSubstituting] = useState(false)\n  const [load_unit_by_exercise, setLoadUnitByExercise] = useState<",
    "  const [substituting, setSubstituting] = useState(false)\n  const [setup_note_open_id, setSetupNoteOpenId] = useState<string | null>(null)\n  const [setup_note_draft, setSetupNoteDraft] = useState('')\n  const [setup_note_saving, setSetupNoteSaving] = useState(false)\n  const [setup_note_error, setSetupNoteError] = useState<string | null>(null)\n  const [load_unit_by_exercise, setLoadUnitByExercise] = useState<",
    "add setup-note state",
)

save_function = """  async function save_setup_note(exercise_id: string) {
    if (!workout?.session.gym_profile_id || setup_note_saving) {
      if (!workout?.session.gym_profile_id) {
        setSetupNoteError('This workout is not linked to a gym profile.')
      }
      return
    }

    setSetupNoteSaving(true)
    setSetupNoteError(null)

    try {
      const equipment = await load_gym_equipment(workout.session.gym_profile_id)
      const machine = equipment.find((item) => item.id === exercise_id)
      if (!machine) {
        throw new Error('This exercise is not available in the current gym profile.')
      }

      await save_gym_machine_identity(
        workout.session.gym_profile_id,
        exercise_id,
        machine.display_name,
        machine.machine_brand ?? '',
        machine.machine_model ?? '',
        setup_note_draft,
      )

      setSetupNoteOpenId(null)
      await refresh_workout()
    } catch (cause) {
      setSetupNoteError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save the machine setup note.',
      )
    } finally {
      setSetupNoteSaving(false)
    }
  }

"""

text = replace_once(
    text,
    "  function prime_rest_audio() {",
    save_function + "  function prime_rest_audio() {",
    "add setup-note save handler",
)

setup_panel = """                        <div className={styles.substitutionPanel}>
                          <button
                            type=\"button\"
                            className={styles.substitutionToggle}
                            onClick={() => {
                              const opening = setup_note_open_id !== exercise.id
                              setSetupNoteOpenId(opening ? exercise.id : null)
                              setSetupNoteDraft(opening ? entry.setup_notes ?? '' : '')
                              setSetupNoteError(null)
                            }}
                          >
                            {setup_note_open_id === exercise.id
                              ? 'CLOSE SETUP NOTE'
                              : 'EDIT SETUP NOTE'}
                          </button>

                          {setup_note_open_id === exercise.id && (
                            <div className={styles.substitutionEditor}>
                              <label>
                                <span>MACHINE SETUP NOTE</span>
                                <input
                                  type=\"text\"
                                  maxLength={500}
                                  value={setup_note_draft}
                                  placeholder=\"e.g. seat 4 · backrest 2 · neutral handles\"
                                  onChange={(event) =>
                                    setSetupNoteDraft(event.target.value)
                                  }
                                />
                              </label>
                              <small>
                                Saved against this machine at the current gym. Workout history stays unchanged.
                              </small>
                              <button
                                type=\"button\"
                                className={styles.substitutionApply}
                                disabled={setup_note_saving}
                                onClick={() =>
                                  void save_setup_note(exercise.exercise_id)
                                }
                              >
                                {setup_note_saving ? 'SAVING…' : 'SAVE SETUP NOTE'}
                              </button>
                              {setup_note_error && (
                                <div className={styles.setError}>{setup_note_error}</div>
                              )}
                            </div>
                          )}
                        </div>

"""

text = replace_once(
    text,
    "                        <PreviousComparablePanel\n                          previous={entry.previous_comparable}",
    setup_panel + "                        <PreviousComparablePanel\n                          previous={entry.previous_comparable}",
    "insert setup-note editor",
)

workout_path.write_text(text)

css_path = Path("src/features/workout/WorkoutScreen.module.css")
css = css_path.read_text()
css = replace_once(
    css,
    ".substitutionEditor select {",
    ".substitutionEditor select,\n.substitutionEditor input {",
    "style setup-note input",
)
css_path.write_text(css)
