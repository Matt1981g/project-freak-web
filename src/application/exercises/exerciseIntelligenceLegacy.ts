import type { Exercise, ExerciseIntelligence } from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'

function normalise(value: string): string {
  return value
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function intelligence(
  primary_muscles: string[],
  secondary_muscles: string[],
  movement_pattern: string,
  exercise_family: string,
  mechanic: ExerciseIntelligence['mechanic'],
  laterality: ExerciseIntelligence['laterality'],
  muscle_length_bias: ExerciseIntelligence['muscle_length_bias'],
  stability_support: ExerciseIntelligence['stability_support'],
  systemic_fatigue: ExerciseIntelligence['systemic_fatigue'],
  local_fatigue: ExerciseIntelligence['local_fatigue'],
  loading_potential: ExerciseIntelligence['loading_potential'],
  progression_reliability: ExerciseIntelligence['progression_reliability'],
  hypertrophy_role: ExerciseIntelligence['hypertrophy_role'],
  grip_or_handle: string | null = null,
  confidence = 0.94,
): ExerciseIntelligence {
  return {
    primary_muscles,
    secondary_muscles,
    stabilizer_muscles: [],
    movement_pattern,
    exercise_family,
    mechanic,
    laterality,
    muscle_length_bias,
    stability_support,
    systemic_fatigue,
    local_fatigue,
    loading_potential,
    progression_reliability,
    hypertrophy_role,
    grip_or_handle,
    metadata_status: 'high_confidence',
    metadata_confidence: confidence,
    metadata_sources: ['PF legacy exercise audit', 'PF biomechanics classification'],
  }
}

const LEGACY: Record<string, ExerciseIntelligence> = {
  'hanging knee raise': intelligence(['Abs'], [], 'Hip flexion / posterior pelvic tilt', 'Knee raise', 'isolation', 'bilateral', 'shortened', 'moderate', 'low', 'moderate', 'low', 'good', 'secondary'),
  'high row': intelligence(['Back'], ['Lats', 'Biceps', 'Traps', 'Shoulders'], 'Horizontal / diagonal pull', 'High row', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  'incline converging smith': intelligence(['Chest'], ['Triceps', 'Shoulders'], 'Incline press', 'Incline chest press', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  'iso lat row': intelligence(['Lats'], ['Back', 'Biceps'], 'Horizontal pull', 'Lat-biased row', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  'overhead press iso lateral machine': intelligence(['Shoulders'], ['Triceps', 'Traps'], 'Vertical press', 'Shoulder press', 'compound', 'bilateral', 'mixed', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  'peach builder': intelligence(['Glutes'], ['Hamstrings'], 'Hip extension / abduction', 'Glute machine', 'isolation', 'bilateral', 'shortened', 'high', 'low', 'high', 'moderate', 'excellent', 'primary'),
  'pendulum squat': intelligence(['Quads'], ['Glutes', 'Hamstrings'], 'Squat', 'Pendulum squat', 'compound', 'bilateral', 'lengthened', 'high', 'high', 'very_high', 'high', 'excellent', 'primary'),
  'plank': intelligence(['Abs'], [], 'Anti-extension', 'Plank', 'isometric', 'bilateral', 'midrange', 'moderate', 'low', 'moderate', 'low', 'good', 'secondary'),
  'plate pinch': intelligence(['Forearms'], [], 'Grip', 'Grip', 'isometric', 'bilateral', 'midrange', 'low', 'very_low', 'moderate', 'low', 'good', 'specialised'),
  'pull up': intelligence(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Pull-up', 'compound', 'bilateral', 'lengthened', 'low', 'moderate', 'high', 'moderate', 'good', 'primary'),
  'chin up': intelligence(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Pull-up', 'compound', 'bilateral', 'lengthened', 'low', 'moderate', 'high', 'moderate', 'good', 'primary'),
  'assisted pull up': intelligence(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Pull-up', 'compound', 'bilateral', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'excellent', 'primary'),
  'close grip bench press': intelligence(['Triceps'], ['Chest', 'Shoulders'], 'Horizontal press', 'Close-grip bench press', 'compound', 'bilateral', 'lengthened', 'moderate', 'moderate', 'high', 'high', 'good', 'primary'),
  'cross body triceps extension': intelligence(['Triceps'], [], 'Elbow extension', 'Triceps extension', 'isolation', 'unilateral', 'lengthened', 'high', 'very_low', 'moderate', 'low', 'excellent', 'primary'),
  'cable oh extension': intelligence(['Triceps'], [], 'Elbow extension', 'Overhead triceps extension', 'isolation', 'bilateral', 'lengthened', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'primary'),
  'oh cable triceps extension': intelligence(['Triceps'], [], 'Elbow extension', 'Overhead triceps extension', 'isolation', 'bilateral', 'lengthened', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'primary'),
  'single arm overhead triceps': intelligence(['Triceps'], [], 'Elbow extension', 'Overhead triceps extension', 'isolation', 'unilateral', 'lengthened', 'high', 'very_low', 'moderate', 'low', 'excellent', 'primary'),
  'deadlift': intelligence(['Hamstrings', 'Glutes'], ['Back', 'Quads', 'Traps'], 'Hip hinge', 'Deadlift', 'compound', 'bilateral', 'lengthened', 'low', 'very_high', 'very_high', 'high', 'good', 'specialised'),
  'decline chest press machine': intelligence(['Chest'], ['Triceps', 'Shoulders'], 'Horizontal press', 'Decline chest press', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  'dips': intelligence(['Triceps', 'Chest'], ['Shoulders'], 'Press', 'Dip', 'compound', 'bilateral', 'lengthened', 'moderate', 'moderate', 'high', 'moderate', 'good', 'primary'),
  'dumbbell overhead press': intelligence(['Shoulders'], ['Triceps', 'Traps'], 'Vertical press', 'Shoulder press', 'compound', 'bilateral', 'mixed', 'moderate', 'moderate', 'high', 'high', 'good', 'primary'),
  'standing barbell overhead press': intelligence(['Shoulders'], ['Triceps', 'Traps'], 'Vertical press', 'Shoulder press', 'compound', 'bilateral', 'mixed', 'low', 'high', 'high', 'high', 'good', 'primary'),
  'grip machine': intelligence(['Forearms'], [], 'Grip', 'Grip machine', 'isolation', 'bilateral', 'midrange', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'specialised'),
  'narrow lat pulldown': intelligence(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary', 'Narrow/neutral handle'),
  'narrow grip pulldown': intelligence(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary', 'Narrow handle'),
  'nautilus triceps press': intelligence(['Triceps'], ['Chest', 'Shoulders'], 'Press', 'Triceps press', 'compound', 'bilateral', 'mixed', 'high', 'low', 'high', 'high', 'excellent', 'primary'),
  'single arm iso lat pulldown': intelligence(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'unilateral', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'excellent', 'primary'),
  'single arm iso pulldown': intelligence(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'unilateral', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'excellent', 'primary'),
}

export function classify_known_legacy_exercise(exercise: Exercise): ExerciseIntelligence | null {
  return LEGACY[normalise(exercise.canonical_name)] ?? null
}

export async function backfill_known_legacy_exercises(
  repository: ExerciseRepository,
  timestamp = new Date().toISOString(),
): Promise<number> {
  const exercises = await repository.list_active()
  let updated = 0

  for (const exercise of exercises) {
    if (exercise.deleted_at !== null) continue
    const candidate = classify_known_legacy_exercise(exercise)
    if (!candidate) continue

    const current = exercise.exercise_intelligence
    if (current?.metadata_status === 'verified' || current?.metadata_status === 'user_confirmed') continue
    if (current && current.metadata_status !== 'needs_review' && current.metadata_confidence >= candidate.metadata_confidence) continue

    await repository.put({
      ...exercise,
      exercise_intelligence: candidate,
      updated_at: timestamp,
      revision: exercise.revision + 1,
    })
    updated += 1
  }

  return updated
}
