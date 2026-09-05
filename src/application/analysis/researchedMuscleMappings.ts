import type { Exercise } from '../../domain/models'
import type { TrainingPriorityArea } from '../priorities/trainingPriorities'
import type { MuscleTargetRole } from './muscleMapping'

export type ResearchConfidence = 'high' | 'medium'

export interface ResearchSource {
  id: 'ace' | 'nasm' | 'strengthlog' | 'lifefitness'
  name: string
  url: string
  role: 'exercise_library' | 'biomechanics' | 'manufacturer'
}

export const MUSCLE_MAPPING_RESEARCH_SOURCES: Record<
  ResearchSource['id'],
  ResearchSource
> = {
  ace: {
    id: 'ace',
    name: 'ACE Exercise Library',
    url: 'https://www.acefitness.org/resources/everyone/exercise-library/',
    role: 'exercise_library',
  },
  nasm: {
    id: 'nasm',
    name: 'NASM Exercise Library',
    url: 'https://www.nasm.org/resource-center/exercise-library',
    role: 'biomechanics',
  },
  strengthlog: {
    id: 'strengthlog',
    name: 'StrengthLog Exercise Directory',
    url: 'https://www.strengthlog.com/exercise-directory/',
    role: 'exercise_library',
  },
  lifefitness: {
    id: 'lifefitness',
    name: 'Life Fitness / Hammer Strength manuals',
    url: 'https://support.lifefitness.com/',
    role: 'manufacturer',
  },
}

export interface ResearchMuscleTarget {
  area: TrainingPriorityArea
  role: MuscleTargetRole
  allocation_weight: number
}

export interface ResearchedExerciseMuscleMapping {
  rule_id: string
  confidence: ResearchConfidence
  targets: ResearchMuscleTarget[]
  source_ids: ResearchSource['id'][]
  rationale: string
}

interface ResearchRule {
  id: string
  confidence: ResearchConfidence
  source_ids: ResearchSource['id'][]
  rationale: string
  matches: (text: string, category: string, equipment: string) => boolean
  targets: ResearchMuscleTarget[]
}

function text(value: string | null | undefined): string {
  return (value ?? '')
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includes_any(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term))
}

const PRIMARY = 1
const SECONDARY = 0.5
const ASSIST = 0.25

const RULES: ResearchRule[] = [
  {
    id: 'leg-press-calf-raise',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog'],
    rationale:
      'Calf-raise variants are consistently classified as plantar-flexion / calf work across the three exercise libraries.',
    matches: (name) =>
      name.includes('calf') &&
      (name.includes('press') || name.includes('raise') || name.includes('extension')),
    targets: [{ area: 'Calfs', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'calf-raise',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Standing, seated and machine calf-raise families consistently target gastrocnemius / soleus; Life Fitness also uses matching machine nomenclature.',
    matches: (name, category) =>
      includes_any(name, ['calf raise', 'standing calf', 'seated calf', 'calf extension']) ||
      category.includes('calf'),
    targets: [{ area: 'Calfs', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'leg-extension',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Machine leg extension is consistently treated as quadriceps-dominant knee extension.',
    matches: (name) => name.includes('leg extension') && !name.includes('tricep'),
    targets: [{ area: 'Quads', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'leg-curl',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Seated and lying leg curls are consistently hamstring-dominant; NASM also identifies gastrocnemius assistance.',
    matches: (name) =>
      includes_any(name, ['leg curl', 'hamstring curl', 'seated curl']) &&
      !includes_any(name, ['bicep', 'arm curl']),
    targets: [
      { area: 'Hamstrings', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Calfs', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'pendulum-hack-squat',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog'],
    rationale:
      'Squat-pattern knee and hip extension is consistently attributed mainly to quadriceps with meaningful glute contribution.',
    matches: (name) =>
      includes_any(name, ['pendulum squat', 'hack squat', 'machine squat', 'squat press']),
    targets: [
      { area: 'Quads', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Glutes', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Hamstrings', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'leg-press',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Leg press is consistently classified as quadriceps / glute work with hamstrings assisting; machine naming is cross-checked against Life Fitness.',
    matches: (name) => name.includes('leg press') && !name.includes('calf'),
    targets: [
      { area: 'Quads', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Glutes', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Hamstrings', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'glute-press-thrust',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Hip-thrust / glute-press / bridge families consistently classify gluteals as the main target.',
    matches: (name, category) =>
      includes_any(name, ['hip thrust', 'glute press', 'glute machine', 'glute bridge', 'hip bridge']) ||
      category === 'glutes',
    targets: [
      { area: 'Glutes', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Hamstrings', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'hip-abduction',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'lifefitness'],
    rationale:
      'Hip-abduction machine work is consistently associated with gluteus medius/minimus / hip abductors.',
    matches: (name) => includes_any(name, ['hip abduction', 'hip abductor']),
    targets: [{ area: 'Glutes', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'biceps-curl',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Barbell, dumbbell, preacher, hammer, cable and machine curl families consistently target elbow flexors, with biceps as the PROJECT FREAK training-area target.',
    matches: (name, category) =>
      category === 'biceps' ||
      (includes_any(name, [
        'bicep curl',
        'biceps curl',
        'preacher curl',
        'hammer curl',
        'bayesian curl',
        'spider curl',
        'concentration curl',
        'incline curl',
        'nautilus bicep',
        'nautilus biceps',
        'arm curl',
      ]) &&
        !includes_any(name, ['leg curl', 'hamstring curl'])),
    targets: [{ area: 'Biceps', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'triceps-isolation',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Pushdown and elbow-extension variants consistently classify triceps as the primary target.',
    matches: (name, category) =>
      category === 'triceps' ||
      includes_any(name, [
        'tricep extension',
        'triceps extension',
        'tricep pushdown',
        'triceps pushdown',
        'pressdown',
        'skull crusher',
        'overhead tricep',
        'overhead triceps',
      ]),
    targets: [{ area: 'Triceps', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'lateral-raise',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Lateral-raise families are consistently shoulder / deltoid isolation movements.',
    matches: (name) =>
      includes_any(name, ['lateral raise', 'side raise']) &&
      !name.includes('leg'),
    targets: [{ area: 'Shoulders', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'rear-delt-reverse-fly',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Rear-delt / reverse-fly machine families consistently target posterior deltoids with upper-back assistance.',
    matches: (name) =>
      includes_any(name, ['rear delt', 'reverse fly', 'reverse pec deck']),
    targets: [
      { area: 'Shoulders', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Back', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Traps', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'face-pull',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog'],
    rationale:
      'Face-pull patterns consistently involve posterior deltoids plus scapular retractors / trapezius.',
    matches: (name) => name.includes('face pull'),
    targets: [
      { area: 'Shoulders', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Traps', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Back', role: 'secondary', allocation_weight: SECONDARY },
    ],
  },
  {
    id: 'shoulder-press',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Machine and free-weight shoulder presses consistently target deltoids with triceps assistance.',
    matches: (name, category) =>
      category === 'shoulders' &&
      name.includes('press') ||
      includes_any(name, ['shoulder press', 'overhead press', 'military press']),
    targets: [
      { area: 'Shoulders', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Triceps', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Traps', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'shrug',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog'],
    rationale:
      'Shrug variants consistently target trapezius elevation.',
    matches: (name, category) => name.includes('shrug') || category === 'traps',
    targets: [
      { area: 'Traps', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Back', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'upright-row',
    confidence: 'medium',
    source_ids: ['ace', 'nasm', 'strengthlog'],
    rationale:
      'Upright rows reliably involve deltoids and trapezius, but the relative emphasis varies with grip width and elbow path.',
    matches: (name) => name.includes('upright row'),
    targets: [
      { area: 'Shoulders', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Traps', role: 'secondary', allocation_weight: SECONDARY },
    ],
  },
  {
    id: 'lat-pulldown',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Lat-pulldown families consistently identify latissimus dorsi as the primary mover with biceps and upper-back / posterior-shoulder assistance.',
    matches: (name) =>
      includes_any(name, [
        'lat pulldown',
        'lat pull down',
        'machine pulldown',
        'fixed pulldown',
        'iso lat pulldown',
      ]),
    targets: [
      { area: 'Lats', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Biceps', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Back', role: 'secondary', allocation_weight: ASSIST },
      { area: 'Traps', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'pull-up-chin-up',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Pull-up / chin-up families consistently load lats and elbow flexors; grip alters emphasis but not the broad PROJECT FREAK muscle areas.',
    matches: (name) =>
      includes_any(name, ['pull up', 'pullup', 'chin up', 'chinup', 'assisted chin']),
    targets: [
      { area: 'Lats', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Biceps', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Back', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'pullover-straight-arm',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog'],
    rationale:
      'Pullover / straight-arm pulldown patterns consistently emphasize shoulder extension through the lats, with surrounding back musculature assisting.',
    matches: (name) =>
      includes_any(name, ['straight arm pulldown', 'straight arm pull down', 'machine pullover', 'cable pullover']),
    targets: [
      { area: 'Lats', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Back', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'row',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Seated, cable, machine, chest-supported and T-bar row families consistently train upper / mid back with lat and biceps assistance.',
    matches: (name, category) =>
      category === 'back' &&
      name.includes('row') ||
      includes_any(name, [
        'seated row',
        'cable row',
        'high row',
        'low row',
        't bar row',
        't-bar row',
        'chest supported row',
        'machine row',
        'mts row',
        'mts high row',
      ]),
    targets: [
      { area: 'Back', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Lats', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Biceps', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Traps', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'chest-fly',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Pectoral fly / pec-deck / cable-fly families consistently target pectorals with anterior-shoulder assistance.',
    matches: (name) =>
      includes_any(name, ['pec deck', 'pectoral fly', 'chest fly', 'cable fly']) &&
      !includes_any(name, ['reverse', 'rear delt']),
    targets: [
      { area: 'Chest', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Shoulders', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'chest-press',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Chest-press and bench-press families consistently load pectorals with triceps and anterior-deltoid assistance.',
    matches: (name, category) =>
      (category === 'chest' && name.includes('press')) ||
      includes_any(name, [
        'chest press',
        'bench press',
        'incline press',
        'decline press',
        'converging press',
        'smith press',
      ]),
    targets: [
      { area: 'Chest', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Triceps', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Shoulders', role: 'secondary', allocation_weight: SECONDARY },
    ],
  },
  {
    id: 'dip',
    confidence: 'medium',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Dips reliably involve chest and triceps, but torso angle and elbow path can materially change which is the main hypertrophy target.',
    matches: (name) => name.includes('dip'),
    targets: [
      { area: 'Triceps', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Chest', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Shoulders', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'abdominal',
    confidence: 'high',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Crunch and abdominal-machine families consistently target abdominal musculature.',
    matches: (name, category) =>
      category === 'abs' ||
      includes_any(name, ['abdominal', 'ab crunch', 'cable crunch', 'machine crunch']),
    targets: [{ area: 'Abs', role: 'primary', allocation_weight: PRIMARY }],
  },
  {
    id: 'romanian-deadlift',
    confidence: 'medium',
    source_ids: ['ace', 'nasm', 'strengthlog'],
    rationale:
      'Romanian-deadlift variants consistently load hamstrings and glutes, but stance, range and technique alter relative stimulus.',
    matches: (name) =>
      includes_any(name, ['romanian deadlift', 'rdl', 'stiff leg deadlift']),
    targets: [
      { area: 'Hamstrings', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Glutes', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Back', role: 'secondary', allocation_weight: ASSIST },
    ],
  },
  {
    id: 'back-extension',
    confidence: 'medium',
    source_ids: ['ace', 'nasm', 'strengthlog', 'lifefitness'],
    rationale:
      'Back-extension variants involve spinal erectors and hip extensors; pad setup and execution determine whether back, glutes or hamstrings dominate.',
    matches: (name) => name.includes('back extension'),
    targets: [
      { area: 'Back', role: 'primary', allocation_weight: PRIMARY },
      { area: 'Glutes', role: 'secondary', allocation_weight: SECONDARY },
      { area: 'Hamstrings', role: 'secondary', allocation_weight: SECONDARY },
    ],
  },
]

export function researched_mapping_for_exercise(
  exercise: Exercise,
): ResearchedExerciseMuscleMapping | null {
  const name = text(exercise.canonical_name)
  const category = text(exercise.category)
  const equipment = text(exercise.equipment)

  const rule = RULES.find((candidate) =>
    candidate.matches(name, category, equipment),
  )
  if (!rule) return null

  return {
    rule_id: rule.id,
    confidence: rule.confidence,
    targets: rule.targets,
    source_ids: rule.source_ids,
    rationale: rule.rationale,
  }
}

export function research_sources_for_mapping(
  mapping: ResearchedExerciseMuscleMapping,
): ResearchSource[] {
  return mapping.source_ids.map((id) => MUSCLE_MAPPING_RESEARCH_SOURCES[id])
}
