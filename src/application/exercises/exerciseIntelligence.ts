import type {
  Exercise,
  ExerciseIntelligence,
  ExerciseMechanic,
  ExerciseLaterality,
  ExerciseLengthBias,
  ExerciseDemand,
  ExerciseStabilitySupport,
  ExerciseLoadingPotential,
  ExerciseProgressionReliability,
  ExerciseHypertrophyRole,
} from '../../domain/models'
import type { ExerciseRepository } from '../../data/repositories/contracts'

interface IntelligenceRule {
  matches: (text: string) => boolean
  intelligence: Omit<ExerciseIntelligence, 'metadata_status' | 'metadata_confidence' | 'metadata_sources'>
  confidence?: number
  sources?: string[]
}

function normalise(value: string | null | undefined): string {
  return (value ?? '')
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function has(text: string, ...terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function base(
  primary_muscles: string[],
  secondary_muscles: string[],
  movement_pattern: string,
  exercise_family: string,
  mechanic: ExerciseMechanic,
  laterality: ExerciseLaterality,
  muscle_length_bias: ExerciseLengthBias,
  stability_support: ExerciseStabilitySupport,
  systemic_fatigue: ExerciseDemand,
  local_fatigue: ExerciseDemand,
  loading_potential: ExerciseLoadingPotential,
  progression_reliability: ExerciseProgressionReliability,
  hypertrophy_role: ExerciseHypertrophyRole,
  grip_or_handle: string | null = null,
  stabilizer_muscles: string[] = [],
): IntelligenceRule['intelligence'] {
  return {
    primary_muscles,
    secondary_muscles,
    stabilizer_muscles,
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
  }
}

const RULES: IntelligenceRule[] = [
  {
    matches: (t) => has(t, 'ab crunch', 'abdominal crunch'),
    intelligence: base(['Abs'], [], 'Trunk flexion', 'Abdominal crunch', 'isolation', 'bilateral', 'shortened', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'secondary'),
  },
  {
    matches: (t) => has(t, 'lower back', 'back extension'),
    intelligence: base(['Back'], ['Glutes', 'Hamstrings'], 'Spinal extension', 'Back extension', 'isolation', 'bilateral', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'good', 'secondary'),
  },
  {
    matches: (t) => has(t, 'bayesian cable curl'),
    intelligence: base(['Biceps'], ['Forearms'], 'Elbow flexion', 'Biceps curl', 'isolation', 'unilateral', 'lengthened', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'primary', 'Single D-handle'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'hammer curl', 'reverse curl'),
    intelligence: base(['Biceps'], ['Forearms'], 'Elbow flexion', 'Elbow-flexor curl', 'isolation', 'either', 'midrange', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'secondary'),
  },
  {
    matches: (t) => t.includes('curl') && !has(t, 'leg curl'),
    intelligence: base(['Biceps'], ['Forearms'], 'Elbow flexion', 'Biceps curl', 'isolation', 'either', 'mixed', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'triceps pressdown', 'tricep pressdown'),
    intelligence: base(['Triceps'], [], 'Elbow extension', 'Triceps pressdown', 'isolation', 'bilateral', 'shortened', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'overhead triceps extension', 'overhead cable triceps extension', 'lying triceps extension', 'skull crusher'),
    intelligence: base(['Triceps'], [], 'Elbow extension', 'Triceps extension', 'isolation', 'either', 'lengthened', 'high', 'very_low', 'moderate', 'moderate', 'good', 'primary'),
  },
  {
    matches: (t) => has(t, 'triceps extension'),
    intelligence: base(['Triceps'], [], 'Elbow extension', 'Triceps extension', 'isolation', 'bilateral', 'midrange', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'seated dip', 'weighted dip', 'dip machine'),
    intelligence: base(['Triceps'], ['Chest', 'Shoulders'], 'Press', 'Dip', 'compound', 'bilateral', 'mixed', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'lateral raise'),
    intelligence: base(['Shoulders'], ['Traps'], 'Shoulder abduction', 'Lateral raise', 'isolation', 'either', 'mixed', 'moderate', 'very_low', 'moderate', 'low', 'good', 'primary'),
  },
  {
    matches: (t) => has(t, 'rear delt', 'reverse fly'),
    intelligence: base(['Shoulders'], ['Back', 'Traps'], 'Horizontal abduction', 'Rear-delt fly', 'isolation', 'either', 'lengthened', 'high', 'very_low', 'moderate', 'low', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'face pull'),
    intelligence: base(['Shoulders', 'Traps'], ['Back'], 'Horizontal pull / external rotation', 'Face pull', 'mixed', 'bilateral', 'shortened', 'moderate', 'very_low', 'moderate', 'low', 'good', 'secondary', 'Rope or dual handles'),
  },
  {
    matches: (t) => has(t, 'upright row'),
    intelligence: base(['Shoulders', 'Traps'], [], 'Vertical pull', 'Upright row', 'compound', 'bilateral', 'midrange', 'moderate', 'low', 'moderate', 'moderate', 'good', 'secondary'),
  },
  {
    matches: (t) => has(t, 'shrug'),
    intelligence: base(['Traps'], [], 'Scapular elevation', 'Shrug', 'isolation', 'bilateral', 'shortened', 'moderate', 'low', 'high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'shoulder press'),
    intelligence: base(['Shoulders'], ['Triceps', 'Traps'], 'Vertical press', 'Shoulder press', 'compound', 'bilateral', 'mixed', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'low to high cable fly'),
    intelligence: base(['Chest'], ['Shoulders'], 'Shoulder horizontal adduction', 'Cable fly', 'isolation', 'bilateral', 'lengthened', 'high', 'very_low', 'moderate', 'low', 'excellent', 'secondary', 'Two single D-handles'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'high to low cable fly'),
    intelligence: base(['Chest'], ['Shoulders'], 'Shoulder horizontal adduction', 'Cable fly', 'isolation', 'bilateral', 'lengthened', 'high', 'very_low', 'moderate', 'low', 'excellent', 'secondary', 'Two single D-handles'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'pec deck', 'pectoral fly', 'cable fly'),
    intelligence: base(['Chest'], ['Shoulders'], 'Shoulder horizontal adduction', 'Chest fly', 'isolation', 'bilateral', 'lengthened', 'high', 'very_low', 'moderate', 'moderate', 'excellent', 'secondary'),
  },
  {
    matches: (t) => has(t, 'incline chest press', 'incline dumbbell press', 'incline bench', 'incline press'),
    intelligence: base(['Chest'], ['Triceps', 'Shoulders'], 'Horizontal press', 'Incline chest press', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'wide chest press', 'chest press', 'bench press'),
    intelligence: base(['Chest'], ['Triceps', 'Shoulders'], 'Horizontal press', 'Chest press', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'straight arm cable pulldown', 'straight arm pulldown', 'pullover'),
    intelligence: base(['Lats'], ['Chest', 'Triceps'], 'Shoulder extension', 'Pullover / straight-arm pulldown', 'isolation', 'bilateral', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'wide grip cable lat pulldown', 'wide grip lat pulldown'),
    intelligence: base(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary', 'Wide pronated bar'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'narrow neutral grip cable lat pulldown', 'close grip pulldown'),
    intelligence: base(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary', 'Close neutral/V handle'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'single arm cable lat pulldown', 'single arm pulldown'),
    intelligence: base(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'unilateral', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'excellent', 'primary', 'Single D-handle'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'lat pulldown', 'vertical traction', 'lat machine', 'pulldown'),
    intelligence: base(['Lats'], ['Biceps', 'Back'], 'Vertical pull', 'Lat pulldown', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'single arm seated cable row'),
    intelligence: base(['Lats'], ['Biceps', 'Back'], 'Horizontal pull', 'Seated cable row', 'compound', 'unilateral', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'excellent', 'primary', 'Single D-handle'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'wide grip seated cable row'),
    intelligence: base(['Back'], ['Lats', 'Biceps', 'Shoulders', 'Traps'], 'Horizontal pull', 'Seated cable row', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary', 'Wide-grip row bar'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'narrow neutral grip seated cable row'),
    intelligence: base(['Lats'], ['Back', 'Biceps'], 'Horizontal pull', 'Seated cable row', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary', 'Close neutral/V handle'),
    confidence: 0.98,
  },
  {
    matches: (t) => has(t, 'row', 't bar') && !has(t, 'upright row'),
    intelligence: base(['Back'], ['Lats', 'Biceps', 'Traps', 'Shoulders'], 'Horizontal pull', 'Row', 'compound', 'either', 'lengthened', 'moderate', 'moderate', 'high', 'high', 'good', 'primary'),
  },
  {
    matches: (t) => has(t, 'leg extension'),
    intelligence: base(['Quads'], [], 'Knee extension', 'Leg extension', 'isolation', 'bilateral', 'shortened', 'high', 'very_low', 'high', 'moderate', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'leg curl'),
    intelligence: base(['Hamstrings'], [], 'Knee flexion', 'Leg curl', 'isolation', 'either', 'lengthened', 'high', 'very_low', 'high', 'moderate', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'romanian deadlift', 'rdl'),
    intelligence: base(['Hamstrings'], ['Glutes', 'Back'], 'Hip hinge', 'Romanian deadlift', 'compound', 'bilateral', 'lengthened', 'low', 'high', 'high', 'high', 'good', 'primary'),
  },
  {
    matches: (t) => has(t, 'hip thrust'),
    intelligence: base(['Glutes'], ['Hamstrings'], 'Hip extension', 'Hip thrust', 'compound', 'bilateral', 'shortened', 'high', 'moderate', 'high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'rear kick', 'kickback', 'pull through'),
    intelligence: base(['Glutes'], ['Hamstrings'], 'Hip extension', 'Hip extension isolation', 'isolation', 'either', 'lengthened', 'high', 'low', 'moderate', 'moderate', 'good', 'secondary'),
  },
  {
    matches: (t) => has(t, 'hip abduction', 'standing abductor'),
    intelligence: base(['Glutes'], [], 'Hip abduction', 'Hip abduction', 'isolation', 'either', 'shortened', 'high', 'very_low', 'moderate', 'low', 'excellent', 'secondary'),
  },
  {
    matches: (t) => has(t, 'hip adduction', 'adductor'),
    intelligence: base(['Adductors'], [], 'Hip adduction', 'Hip adduction', 'isolation', 'either', 'lengthened', 'high', 'very_low', 'moderate', 'low', 'excellent', 'secondary'),
  },
  {
    matches: (t) => has(t, 'hack squat', 'belt squat', 'goblet squat', 'back squat'),
    intelligence: base(['Quads'], ['Glutes', 'Hamstrings'], 'Squat', 'Squat', 'compound', 'bilateral', 'lengthened', 'moderate', 'high', 'high', 'high', 'good', 'primary'),
  },
  {
    matches: (t) => has(t, 'leg press', 'linear leg press'),
    intelligence: base(['Quads'], ['Glutes', 'Hamstrings'], 'Leg press', 'Leg press', 'compound', 'bilateral', 'lengthened', 'high', 'moderate', 'very_high', 'high', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'seated calf'),
    intelligence: base(['Calfs'], [], 'Plantar flexion', 'Calf raise', 'isolation', 'bilateral', 'lengthened', 'high', 'very_low', 'high', 'moderate', 'excellent', 'primary'),
  },
  {
    matches: (t) => has(t, 'calf'),
    intelligence: base(['Calfs'], [], 'Plantar flexion', 'Calf raise', 'isolation', 'bilateral', 'lengthened', 'high', 'very_low', 'high', 'high', 'excellent', 'primary'),
  },
]

function category_fallback(exercise: Exercise): ExerciseIntelligence {
  const category = normalise(exercise.category)
  const equipment = normalise(exercise.equipment)
  const category_map: Record<string, string[]> = {
    biceps: ['Biceps'], triceps: ['Triceps'], shoulders: ['Shoulders'], delts: ['Shoulders'],
    traps: ['Traps'], lats: ['Lats'], back: ['Back'], quads: ['Quads'], hamstrings: ['Hamstrings'],
    glutes: ['Glutes'], adductors: ['Adductors'], calves: ['Calfs'], calfs: ['Calfs'], abs: ['Abs'], chest: ['Chest'],
  }
  const primary = category_map[category] ?? []
  const machine = has(equipment, 'machine', 'cable')
  return {
    ...base(
      primary,
      [],
      'Needs classification',
      category || 'Unclassified',
      'mixed',
      'either',
      'unknown',
      machine ? 'high' : 'moderate',
      'moderate',
      'moderate',
      'moderate',
      'good',
      'specialised',
    ),
    metadata_status: 'needs_review',
    metadata_confidence: primary.length > 0 ? 0.68 : 0.45,
    metadata_sources: ['PF category fallback — manual review required'],
  }
}

export function classify_exercise_intelligence(exercise: Exercise): ExerciseIntelligence {
  const text = normalise([
    exercise.canonical_name,
    exercise.short_name,
    exercise.category,
    exercise.equipment,
    exercise.machine_brand,
    exercise.machine_model,
  ].filter(Boolean).join(' '))
  const rule = RULES.find((candidate) => candidate.matches(text))
  if (!rule) return category_fallback(exercise)

  const manufacturer_source = exercise.machine_brand?.toLocaleLowerCase('en-GB') === 'technogym'
    ? ['Technogym equipment catalogue', 'PF biomechanics classification']
    : ['PF biomechanics classification']

  return {
    ...rule.intelligence,
    metadata_status: 'high_confidence',
    metadata_confidence: rule.confidence ?? 0.94,
    metadata_sources: rule.sources ?? manufacturer_source,
  }
}

function should_replace(existing: ExerciseIntelligence | null | undefined, candidate: ExerciseIntelligence): boolean {
  if (!existing) return true
  if (existing.metadata_status === 'verified' || existing.metadata_status === 'user_confirmed') return false
  if (existing.metadata_status === 'needs_review' && candidate.metadata_status !== 'needs_review') return true
  return candidate.metadata_confidence > existing.metadata_confidence + 0.02
}

export interface ExerciseIntelligenceBackfillResult {
  scanned: number
  updated: number
  high_confidence: number
  needs_review: number
  review_items: Array<{ exercise_id: string; exercise_name: string; confidence: number }>
}

export async function backfill_exercise_intelligence(
  repository: ExerciseRepository,
  timestamp = new Date().toISOString(),
): Promise<ExerciseIntelligenceBackfillResult> {
  const exercises = (await repository.list_active()).filter((exercise) => exercise.deleted_at === null)
  let updated = 0

  for (const exercise of exercises) {
    const candidate = classify_exercise_intelligence(exercise)
    if (!should_replace(exercise.exercise_intelligence, candidate)) continue

    await repository.put({
      ...exercise,
      exercise_intelligence: candidate,
      updated_at: timestamp,
      revision: exercise.revision + 1,
      source_kind: exercise.source_kind,
      source_id: exercise.source_id,
    })
    updated += 1
  }

  const refreshed = (await repository.list_active()).filter((exercise) => exercise.deleted_at === null)
  const review_items = refreshed
    .filter((exercise) => exercise.exercise_intelligence?.metadata_status === 'needs_review')
    .map((exercise) => ({
      exercise_id: exercise.id,
      exercise_name: exercise.canonical_name,
      confidence: exercise.exercise_intelligence?.metadata_confidence ?? 0,
    }))
    .sort((a, b) => a.exercise_name.localeCompare(b.exercise_name, 'en-GB'))

  return {
    scanned: refreshed.length,
    updated,
    high_confidence: refreshed.filter((exercise) => {
      const intelligence = exercise.exercise_intelligence
      return Boolean(intelligence && intelligence.metadata_status !== 'needs_review' && intelligence.metadata_confidence >= 0.8)
    }).length,
    needs_review: review_items.length,
    review_items,
  }
}
