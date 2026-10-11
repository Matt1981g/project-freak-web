import type { RepositoryBundle } from '../../data/repositories/contracts'

export interface ExerciseEnjoymentInsight {
  exercise_id: string
  exercise_name: string
  gym_profile_id: string | null
  samples: number
  average_enjoyment: number
  recent_average: number
  trend: number | null
  average_pump: number | null
  average_form: number | null
  status: 'insufficient_evidence' | 'favourite' | 'low_enjoyment' | 'neutral'
}

interface EnjoymentExposure {
  date: string
  session_id: string
  enjoyment: number
  pump: number | null
  form: number | null
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function summarise_exercise_enjoyment(
  exercise_id: string,
  exercise_name: string,
  gym_profile_id: string | null,
  exposures: readonly EnjoymentExposure[],
): ExerciseEnjoymentInsight | null {
  if (exposures.length === 0) return null
  // Stable ordering avoids fluctuating trend calculations after sync.
  const ordered = [...exposures].sort(
    (a, b) => a.date.localeCompare(b.date) || a.session_id.localeCompare(b.session_id),
  )
  const scores = ordered.map((entry) => entry.enjoyment)
  const recent = scores.slice(-3)
  const previous = scores.slice(-6, -3)
  const recent_average = average(recent)
  const trend = previous.length > 0 && scores.length >= 4
    ? recent_average - average(previous)
    : null
  const pump = ordered.flatMap((entry) => entry.pump === null ? [] : [entry.pump])
  const form = ordered.flatMap((entry) => entry.form === null ? [] : [entry.form])
  const status: ExerciseEnjoymentInsight['status'] =
    scores.length < 3 ? 'insufficient_evidence'
      : recent_average >= 8 ? 'favourite'
        : recent_average <= 4 ? 'low_enjoyment' : 'neutral'

  return {
    exercise_id,
    exercise_name,
    gym_profile_id,
    samples: scores.length,
    average_enjoyment: average(scores),
    recent_average,
    trend,
    average_pump: pump.length ? average(pump) : null,
    average_form: form.length ? average(form) : null,
    status,
  }
}

export async function load_exercise_enjoyment_insights(
  repositories: RepositoryBundle,
): Promise<ExerciseEnjoymentInsight[]> {
  const sessions = (await repositories.sessions.list_sessions_descending())
    .filter((session) => session.deleted_at === null && session.status === 'completed')
  const grouped = new Map<string, {
    exercise_id: string
    exercise_name: string
    gym_profile_id: string | null
    exposures: EnjoymentExposure[]
  }>()

  for (const session of sessions) {
    const appearances = await repositories.sessions.list_session_exercises(session.id)
    for (const appearance of appearances) {
      if (appearance.deleted_at !== null || appearance.completed_at === null) continue
      const metrics = await repositories.sessions.get_exercise_metrics(appearance.id)
      if (!metrics || metrics.deleted_at !== null || metrics.enjoyment == null) continue
      const key = [session.gym_profile_id ?? '', appearance.exercise_id].join('|')
      let row = grouped.get(key)
      if (!row) {
        row = {
          exercise_id: appearance.exercise_id,
          exercise_name: appearance.exercise_name_snapshot,
          gym_profile_id: session.gym_profile_id ?? null,
          exposures: [],
        }
        grouped.set(key, row)
      }
      row.exposures.push({
        date: session.session_date_local,
        session_id: session.id,
        enjoyment: metrics.enjoyment,
        pump: metrics.pump,
        form: metrics.form,
      })
    }
  }

  return [...grouped.values()]
    .map((group) => summarise_exercise_enjoyment(
      group.exercise_id, group.exercise_name, group.gym_profile_id, group.exposures,
    ))
    .filter((row): row is ExerciseEnjoymentInsight => row !== null)
    .sort((a, b) => b.samples - a.samples || b.recent_average - a.recent_average)
}
