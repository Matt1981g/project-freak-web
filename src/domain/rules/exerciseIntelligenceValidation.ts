import { z } from 'zod'

const text = z.string().trim().min(1)
const demand = z.enum(['very_low', 'low', 'moderate', 'high', 'very_high'])
export const exercise_intelligence_schema = z.object({
  primary_muscles: z.array(text),
  secondary_muscles: z.array(text),
  stabilizer_muscles: z.array(text),
  movement_pattern: text,
  exercise_family: text,
  mechanic: z.enum(['compound', 'isolation', 'isometric', 'mixed']),
  laterality: z.enum(['bilateral', 'unilateral', 'alternating', 'either']),
  muscle_length_bias: z.enum(['lengthened', 'midrange', 'shortened', 'mixed', 'variable', 'unknown']),
  stability_support: z.enum(['low', 'moderate', 'high']),
  systemic_fatigue: demand,
  local_fatigue: demand,
  loading_potential: z.enum(['low', 'moderate', 'high']),
  progression_reliability: z.enum(['poor', 'good', 'excellent']),
  hypertrophy_role: z.enum(['primary', 'secondary', 'finisher', 'specialised']),
  grip_or_handle: z.string().nullable(),
  metadata_status: z.enum(['verified', 'high_confidence', 'needs_review', 'user_confirmed']),
  metadata_confidence: z.number().min(0).max(1),
  metadata_sources: z.array(text).min(1),
}).passthrough()

export function intelligence_key(value: string): string {
  return value.toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/g, ' ').trim()
}

export interface IntelligenceIssue {
  code: 'missing_metadata' | 'invalid_metadata' | 'unresolved_classification' | 'duplicate_muscle' | 'muscle_role_overlap' | 'confidence_status'
  field: string
  message: string
}

/** Read-only validation, including confirmed records. Never infer a replacement. */
export function validate_exercise_intelligence(value: unknown): IntelligenceIssue[] {
  if (value === null || value === undefined) {
    return [{ code: 'missing_metadata', field: 'exercise_intelligence', message: 'Exercise intelligence is missing.' }]
  }
  const parsed = exercise_intelligence_schema.safeParse(value)
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      code: 'invalid_metadata', field: issue.path.join('.'),
      message: `${issue.path.join('.') || 'exercise_intelligence'}: ${issue.message}`,
    }))
  }
  const data = parsed.data
  const issues: IntelligenceIssue[] = []
  if (data.primary_muscles.length === 0) issues.push({ code: 'invalid_metadata', field: 'primary_muscles', message: 'Choose at least one primary muscle.' })
  for (const field of ['movement_pattern', 'exercise_family', 'muscle_length_bias'] as const) {
    if (['needs classification', 'unclassified', 'unknown', 'unspecified', 'tbd'].includes(intelligence_key(data[field]))) {
      issues.push({ code: 'unresolved_classification', field, message: `${field} still needs classification.` })
    }
  }
  const seen = new Map<string, string>()
  for (const field of ['primary_muscles', 'secondary_muscles', 'stabilizer_muscles'] as const) {
    const local = new Set<string>()
    for (const muscle of data[field]) {
      const key = intelligence_key(muscle)
      if (local.has(key)) issues.push({ code: 'duplicate_muscle', field, message: `${muscle} is repeated in ${field}.` })
      else if (seen.has(key)) issues.push({ code: 'muscle_role_overlap', field, message: `${muscle} appears in both ${seen.get(key)} and ${field}.` })
      local.add(key)
      seen.set(key, field)
    }
  }
  if ((data.metadata_status === 'user_confirmed' && data.metadata_confidence !== 1) ||
      (data.metadata_status === 'high_confidence' && data.metadata_confidence < 0.8)) {
    issues.push({ code: 'confidence_status', field: 'metadata_confidence', message: 'Confidence does not agree with metadata status.' })
  }
  return issues
}
