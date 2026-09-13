export interface TridentCatalogueSeed {
  id: string
  name: string
  display_name: string
  brand: string | null
  model: string | null
  category: string
  equipment: string
  notes: string
  verification: 'candidate' | 'reported'
}

function slug(value: string): string {
  return value.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function pure(model: string, name: string, category: string, muscles: string[]): TridentCatalogueSeed {
  return {
    id: `trident-technogym-pure-strength-${model.toLowerCase()}-${slug(name)}`,
    name,
    display_name: `${name} - Pure Strength ${model}`,
    brand: 'Technogym',
    model: `Pure Strength ${model}`,
    category,
    equipment: 'Plate-loaded machine',
    notes: `Technogym Pure Strength catalogue. Muscles in catalogue order: ${muscles.join(' > ')}.`,
    verification: 'candidate',
  }
}

function selection(model: string, name: string, category: string, muscles: string[]): TridentCatalogueSeed {
  return {
    id: `trident-technogym-selection-700-${model.toLowerCase()}-${slug(name)}`,
    name,
    display_name: `${name} - Selection 700 ${model}`,
    brand: 'Technogym',
    model: `Selection 700 ${model}`,
    category,
    equipment: 'Pin-loaded machine',
    notes: `Technogym Selection 700 range. Target order: ${muscles.join(' > ')}.`,
    verification: 'candidate',
  }
}

function reported(
  id: string,
  name: string,
  category: string,
  equipment: string,
  model: string,
): TridentCatalogueSeed {
  return {
    id: `trident-generic-${id}`,
    name,
    display_name: name,
    brand: 'Generic',
    model,
    category,
    equipment,
    notes: 'Reported present at Trident by the user. Treat as confirmed infrastructure.',
    verification: 'reported',
  }
}

export const TRIDENT_PURE_STRENGTH_CATALOGUE: readonly TridentCatalogueSeed[] = [
  pure('MG7500', 'Linear Leg Press', 'Quads', ['Quadriceps', 'Gluteus', 'Hamstrings', 'Gastrocnemius', 'Soleus']),
  pure('MG5000', 'Leg Press', 'Quads', ['Quadriceps', 'Gluteus', 'Hamstrings', 'Gastrocnemius', 'Soleus']),
  pure('MG6500', 'Leg Extension', 'Quads', ['Quadriceps']),
  pure('MG7000', 'Standing Leg Curl', 'Hamstrings', ['Hamstrings']),
  pure('MG4000', 'Rear Kick', 'Glutes', ['Gluteus', 'Hamstrings', 'Quadriceps']),
  pure('MG4500', 'Calf', 'Calfs', ['Gastrocnemius', 'Soleus']),
  pure('MG4600', 'Seated Calf', 'Calfs', ['Gastrocnemius', 'Soleus']),
  pure('MG9500', 'Standing Abductor', 'Glutes', ['Gluteus', 'Abductors']),
  pure('MG8000', 'Hip Thrust', 'Glutes', ['Gluteus', 'Hamstrings', 'Erector Spinae']),
  pure('MG8500', 'Hack Squat', 'Quads', ['Gluteus', 'Quadriceps', 'Hamstrings']),
  pure('MG8600', 'Belt Squat', 'Quads', ['Quadriceps', 'Gluteus', 'Adductors', 'Gastrocnemius', 'Soleus', 'Hamstrings']),
  pure('MG8700', 'Deadlift', 'Hamstrings', ['Hamstrings', 'Gluteus', 'Quadriceps', 'Erector Spinae', 'Gastrocnemius', 'Soleus', 'Trapezii']),
  pure('MG0500', 'Chest Press', 'Chest', ['Pectoralis Major', 'Triceps', 'Anterior Deltoids']),
  pure('MG1500', 'Incline Chest Press', 'Chest', ['Pectoralis Major', 'Triceps', 'Anterior Deltoids']),
  pure('MG1000', 'Wide Chest Press', 'Chest', ['Pectoralis Major', 'Triceps', 'Anterior Deltoids']),
  pure('MG2000', 'Pulldown', 'Lats', ['Latissimus Dorsi', 'Biceps', 'Rhomboids']),
  pure('MG2500', 'Low Row', 'Back', ['Latissimus Dorsi', 'Biceps', 'Rhomboids', 'Trapezius']),
  pure('MG3000', 'Row', 'Back', ['Latissimus Dorsi', 'Biceps', 'Trapezius', 'Deltoids (Posterior)']),
  pure('MG5500', 'Seated Dip', 'Triceps', ['Triceps', 'Pectoralis Major', 'Anterior Deltoids']),
  pure('MG6000', 'Biceps', 'Biceps', ['Biceps']),
  pure('MG3500', 'Shoulder Press', 'Shoulders', ['Anterior Deltoids', 'Posterior Deltoids', 'Triceps', 'Trapezii']),
  pure('MG9000', 'Pullover', 'Lats', ['Latissimus Dorsi', 'Pectoralis Major', 'Triceps']),
] as const

// Selection 700 is deliberately a candidate range until each physical unit is checked at Trident.
// Dual machines are separate exercise options so PF can programme and track each movement correctly.
export const TRIDENT_SELECTION_700_CATALOGUE: readonly TridentCatalogueSeed[] = [
  selection('MNFC', 'Chest Press', 'Chest', ['Pectorals', 'Deltoids', 'Triceps']),
  selection('MNGC', 'Vertical Traction', 'Lats', ['Latissimus Dorsi', 'Biceps']),
  selection('MNHC', 'Low Row', 'Back', ['Latissimus Dorsi', 'Biceps', 'Rhomboids']),
  selection('MNDC', 'Multi Hip', 'Glutes', ['Gluteals', 'Hip flexors', 'Hip extensors', 'Abductors', 'Adductors']),
  selection('MNIC', 'Leg Curl', 'Hamstrings', ['Hamstrings']),
  selection('MNJC', 'Leg Extension', 'Quads', ['Quadriceps']),
  selection('MNLC', 'Lat Machine', 'Lats', ['Latissimus Dorsi', 'Biceps']),
  selection('MNAC', 'Leg Press', 'Quads', ['Quadriceps', 'Gluteals', 'Hamstrings']),
  selection('MNBC', 'Abdominal Crunch', 'Abs', ['Abdominals']),
  selection('MNCC', 'Lower Back', 'Back', ['Erector Spinae']),
  selection('MNKC', 'Delts Machine', 'Shoulders', ['Deltoids']),
  selection('MNEC', 'Shoulder Press', 'Shoulders', ['Deltoids', 'Triceps']),
  selection('MNOC', 'Hip Abduction', 'Glutes', ['Abductors', 'Gluteals']),
  selection('MNOC', 'Hip Adduction', 'Glutes', ['Adductors']),
  selection('MNNC', 'Pectoral Fly', 'Chest', ['Pectorals', 'Anterior Deltoids']),
  selection('MNNC', 'Reverse Fly', 'Shoulders', ['Posterior Deltoids', 'Rhomboids', 'Trapezius']),
  selection('MNMC', 'Seated Leg Curl', 'Hamstrings', ['Hamstrings']),
  selection('MNMC', 'Leg Extension', 'Quads', ['Quadriceps']),
  selection('MN6', 'Biceps Curl', 'Biceps', ['Biceps']),
  selection('MN6', 'Triceps Extension', 'Triceps', ['Triceps']),
] as const

const CABLE_ATTACHMENTS = 'Four generic cable stations with standard handles and bars'
const DUMBBELLS = 'Large dumbbell range'
const OLYMPIC = 'Squat racks with Olympic bars and plates'

export const TRIDENT_REPORTED_EXERCISES: readonly TridentCatalogueSeed[] = [
  reported('cable-lat-pulldown', 'Cable Lat Pulldown', 'Lats', 'Cable', CABLE_ATTACHMENTS),
  reported('seated-cable-row', 'Seated Cable Row', 'Back', 'Cable', CABLE_ATTACHMENTS),
  reported('straight-arm-cable-pulldown', 'Straight-Arm Cable Pulldown', 'Lats', 'Cable', CABLE_ATTACHMENTS),
  reported('cable-fly', 'Cable Fly', 'Chest', 'Cable', CABLE_ATTACHMENTS),
  reported('cable-lateral-raise', 'Cable Lateral Raise', 'Shoulders', 'Cable', CABLE_ATTACHMENTS),
  reported('cable-rear-delt-fly', 'Cable Rear-Delt Fly', 'Shoulders', 'Cable', CABLE_ATTACHMENTS),
  reported('face-pull', 'Face Pull', 'Traps', 'Cable', CABLE_ATTACHMENTS),
  reported('cable-upright-row', 'Cable Upright Row', 'Traps', 'Cable', CABLE_ATTACHMENTS),
  reported('cable-biceps-curl', 'Cable Biceps Curl', 'Biceps', 'Cable', CABLE_ATTACHMENTS),
  reported('rope-hammer-curl', 'Rope Hammer Curl', 'Biceps', 'Cable', CABLE_ATTACHMENTS),
  reported('triceps-pressdown', 'Cable Triceps Pressdown', 'Triceps', 'Cable', CABLE_ATTACHMENTS),
  reported('overhead-cable-triceps-extension', 'Overhead Cable Triceps Extension', 'Triceps', 'Cable', CABLE_ATTACHMENTS),
  reported('cable-ab-crunch', 'Cable Ab Crunch', 'Abs', 'Cable', CABLE_ATTACHMENTS),
  reported('cable-pull-through', 'Cable Pull-Through', 'Glutes', 'Cable', CABLE_ATTACHMENTS),
  reported('dumbbell-curl', 'Dumbbell Curl', 'Biceps', 'Dumbbells', DUMBBELLS),
  reported('hammer-curl', 'Dumbbell Hammer Curl', 'Biceps', 'Dumbbells', DUMBBELLS),
  reported('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Shoulders', 'Dumbbells', DUMBBELLS),
  reported('dumbbell-rear-delt-raise', 'Dumbbell Rear-Delt Raise', 'Shoulders', 'Dumbbells', DUMBBELLS),
  reported('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Shoulders', 'Dumbbells', DUMBBELLS),
  reported('dumbbell-shrug', 'Dumbbell Shrug', 'Traps', 'Dumbbells', DUMBBELLS),
  reported('one-arm-dumbbell-row', 'One-Arm Dumbbell Row', 'Back', 'Dumbbells', DUMBBELLS),
  reported('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'Hamstrings', 'Dumbbells', DUMBBELLS),
  reported('goblet-squat', 'Dumbbell Goblet Squat', 'Quads', 'Dumbbells', DUMBBELLS),
  reported('barbell-back-squat', 'Barbell Back Squat', 'Quads', 'Barbell', OLYMPIC),
  reported('barbell-romanian-deadlift', 'Barbell Romanian Deadlift', 'Hamstrings', 'Barbell', OLYMPIC),
  reported('barbell-deadlift', 'Barbell Deadlift', 'Hamstrings', 'Barbell', OLYMPIC),
  reported('barbell-bent-over-row', 'Barbell Bent-Over Row', 'Back', 'Barbell', OLYMPIC),
  reported('barbell-overhead-press', 'Barbell Overhead Press', 'Shoulders', 'Barbell', OLYMPIC),
  reported('barbell-curl', 'Barbell Curl', 'Biceps', 'Barbell', OLYMPIC),
] as const

export const TRIDENT_CATALOGUE: readonly TridentCatalogueSeed[] = [
  ...TRIDENT_PURE_STRENGTH_CATALOGUE,
  ...TRIDENT_SELECTION_700_CATALOGUE,
  ...TRIDENT_REPORTED_EXERCISES,
] as const
