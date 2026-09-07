export const PF_ADAPTIVE_CHALLENGE_PREFIX = 'PF_ADAPTIVE_CHALLENGE:'
export const PF_COACH_CHALLENGE_MARKER = 'PF_COACH_CHALLENGE'

export interface AdaptiveChallengeMetadata {
  source_session_id: string
  baseline_load_kg: number | null
  target_load_kg: number | null
  baseline_rep_min: number | null
  baseline_rep_max: number | null
  target_rep_min: number | null
  target_rep_max: number | null
}

function finite_or_null(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function encode_adaptive_challenge(
  metadata: AdaptiveChallengeMetadata,
): string {
  return `${PF_ADAPTIVE_CHALLENGE_PREFIX}${JSON.stringify(metadata)}`
}

export function parse_adaptive_challenge(
  notes: string | null | undefined,
): AdaptiveChallengeMetadata | null {
  if (!notes) return null

  const line = notes
    .split('\n')
    .find((value) => value.startsWith(PF_ADAPTIVE_CHALLENGE_PREFIX))
  if (!line) return null

  try {
    const parsed = JSON.parse(
      line.slice(PF_ADAPTIVE_CHALLENGE_PREFIX.length),
    ) as Record<string, unknown>

    if (typeof parsed.source_session_id !== 'string') return null

    return {
      source_session_id: parsed.source_session_id,
      baseline_load_kg: finite_or_null(parsed.baseline_load_kg),
      target_load_kg: finite_or_null(parsed.target_load_kg),
      baseline_rep_min: finite_or_null(parsed.baseline_rep_min),
      baseline_rep_max: finite_or_null(parsed.baseline_rep_max),
      target_rep_min: finite_or_null(parsed.target_rep_min),
      target_rep_max: finite_or_null(parsed.target_rep_max),
    }
  } catch {
    return null
  }
}

export function progression_challenge_fields(
  notes: string | null | undefined,
): { load: boolean; reps: boolean } {
  const adaptive = parse_adaptive_challenge(notes)
  if (adaptive) {
    return {
      load:
        adaptive.baseline_load_kg !== adaptive.target_load_kg,
      reps:
        adaptive.baseline_rep_min !== adaptive.target_rep_min ||
        adaptive.baseline_rep_max !== adaptive.target_rep_max,
    }
  }

  if (notes?.includes(PF_COACH_CHALLENGE_MARKER)) {
    // Coach challenge notes may be intentionally lightweight. Highlight both
    // target dimensions rather than pretending we know which one changed.
    return { load: true, reps: true }
  }

  return { load: false, reps: false }
}

export function is_progression_challenge_note(
  notes: string | null | undefined,
): boolean {
  return (
    parse_adaptive_challenge(notes) !== null ||
    Boolean(notes?.includes(PF_COACH_CHALLENGE_MARKER))
  )
}

export function progression_challenge_lines(
  notes: string | null | undefined,
): string[] {
  if (!notes) return []

  return notes
    .split('\n')
    .filter(
      (line) =>
        line.startsWith(PF_ADAPTIVE_CHALLENGE_PREFIX) ||
        line.includes(PF_COACH_CHALLENGE_MARKER),
    )
}
