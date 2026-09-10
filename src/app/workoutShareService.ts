import { build_workout_summary } from '../application/workout/completeWorkout'
import { projectFreakDb } from '../data/db/projectFreakDb'
import { create_repositories } from '../data/repositories'
import type { SessionExercise, TrainingSet } from '../domain/models'
import { is_training_set_completed } from '../domain/rules/completion'

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1350
const repositories = create_repositories(projectFreakDb)

export interface WorkoutShareExerciseHighlight {
  exercise_name: string
  set_detail: string
}

export interface WorkoutShareCardData {
  session_id: string
  date_label: string
  filename_date: string
  session_name: string
  duration_label: string
  exercise_count: number
  completed_sets: number
  total_volume_label: string
  session_highlight: WorkoutShareExerciseHighlight | null
  exercise_highlights: WorkoutShareExerciseHighlight[]
}

function completed_reps(set: TrainingSet): number | null {
  return (
    set.completed_reps ??
    set.primary_reps_completed ??
    (set.left_reps_completed !== null && set.right_reps_completed !== null
      ? set.left_reps_completed + set.right_reps_completed
      : null)
  )
}

function set_score(set: TrainingSet): [number, number, number] {
  const reps = completed_reps(set) ?? 0
  const load = set.load_kg ?? 0
  const volume = set.set_load_kg_reps ?? load * reps
  return [volume, load, reps]
}

function compare_sets(left: TrainingSet, right: TrainingSet): number {
  const left_score = set_score(left)
  const right_score = set_score(right)

  for (let index = 0; index < left_score.length; index += 1) {
    if (left_score[index] !== right_score[index]) {
      return right_score[index] - left_score[index]
    }
  }

  return left.set_number - right.set_number
}

function best_set(sets: readonly TrainingSet[]): TrainingSet | null {
  const candidates = sets
    .filter((set) => set.set_role === 'work' && is_training_set_completed(set))
    .sort(compare_sets)
  return candidates[0] ?? null
}

function format_number(value: number): string {
  return value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function format_set_detail(set: TrainingSet): string {
  const reps = completed_reps(set)

  if (set.rep_mode === 'timed' && set.duration_seconds !== null) {
    return `${set.duration_seconds}s`
  }

  const reps_label = reps === null ? null : String(reps)

  if (set.load_type === 'bodyweight') {
    return reps_label === null ? 'BW' : `BW × ${reps_label}`
  }

  if (set.load_type === 'assistance' && set.load_kg !== null) {
    return reps_label === null
      ? `BW - ${format_number(set.load_kg)} kg`
      : `BW - ${format_number(set.load_kg)} kg × ${reps_label}`
  }

  if (set.load_kg !== null) {
    return reps_label === null
      ? `${format_number(set.load_kg)} kg`
      : `${format_number(set.load_kg)} kg × ${reps_label}`
  }

  return reps_label === null ? 'Completed' : `${reps_label} reps`
}

function format_duration(seconds: number | null): string {
  if (seconds === null) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}H ${minutes}M`
  return `${minutes} MIN`
}

function format_date(session_date_local: string): {
  label: string
  filename_date: string
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(session_date_local)
  if (!match) {
    return {
      label: session_date_local.toUpperCase(),
      filename_date: new Date().toISOString().slice(0, 10).replaceAll('-', ''),
    }
  }

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return {
    label: new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
      .format(date)
      .toUpperCase(),
    filename_date: `${year}${month}${day}`,
  }
}

function ordered_exercises(
  exercises: readonly SessionExercise[],
): SessionExercise[] {
  return [...exercises].sort(
    (left, right) => left.actual_order - right.actual_order,
  )
}

function exercise_highlight(
  exercise: SessionExercise,
  sets: readonly TrainingSet[],
): WorkoutShareExerciseHighlight | null {
  const top_set = best_set(
    sets.filter((set) => set.session_exercise_id === exercise.id),
  )
  if (!top_set) return null
  return {
    exercise_name: exercise.exercise_name_snapshot,
    set_detail: format_set_detail(top_set),
  }
}

export async function build_workout_share_card_data(
  completed_session_id: string,
): Promise<WorkoutShareCardData> {
  const session = await repositories.sessions.get_session(completed_session_id)
  if (!session) throw new Error('Workout session was not found.')
  if (session.status !== 'completed') {
    throw new Error('Only completed workouts can generate a share image.')
  }

  const [exercises, sets] = await Promise.all([
    repositories.sessions.list_session_exercises(completed_session_id),
    repositories.sessions.list_sets_for_session(completed_session_id),
  ])
  const summary = build_workout_summary(session, exercises, sets)
  const ordered = ordered_exercises(exercises)
  const completed_work_sets = sets.filter(
    (set) => set.set_role === 'work' && is_training_set_completed(set),
  )
  const top_set = best_set(completed_work_sets)
  const top_exercise = top_set
    ? ordered.find((exercise) => exercise.id === top_set.session_exercise_id) ?? null
    : null
  const session_highlight =
    top_set && top_exercise
      ? {
          exercise_name: top_exercise.exercise_name_snapshot,
          set_detail: format_set_detail(top_set),
        }
      : null

  const highlight_exercise_id = top_exercise?.id ?? null
  const exercise_order = highlight_exercise_id
    ? [
        ...ordered.filter((exercise) => exercise.id === highlight_exercise_id),
        ...ordered.filter((exercise) => exercise.id !== highlight_exercise_id),
      ]
    : ordered

  const exercise_highlights = exercise_order
    .map((exercise) => exercise_highlight(exercise, completed_work_sets))
    .filter(
      (value): value is WorkoutShareExerciseHighlight => value !== null,
    )
    .slice(0, 4)

  const date = format_date(session.session_date_local)

  return {
    session_id: session.id,
    date_label: date.label,
    filename_date: date.filename_date,
    session_name: session.session_name,
    duration_label: format_duration(summary.duration_seconds),
    exercise_count: summary.exercise_count,
    completed_sets: summary.completed_sets,
    total_volume_label: `${format_number(summary.total_volume_kg)} KG`,
    session_highlight,
    exercise_highlights,
  }
}

function rounded_rect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height,
  )
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

function fit_text(
  context: CanvasRenderingContext2D,
  text: string,
  max_width: number,
  start_size: number,
  minimum_size: number,
  weight = 900,
): number {
  let size = start_size
  while (size > minimum_size) {
    context.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    if (context.measureText(text).width <= max_width) return size
    size -= 2
  }
  return minimum_size
}

function draw_label(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
): void {
  context.fillStyle = colour
  context.font = '900 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.fillText(text, x, y)
}

function load_image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load PF logo for share image.'))
    image.src = url
  })
}

async function render_workout_share_card(
  data: WorkoutShareCardData,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot create the share image.')

  const background = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
  background.addColorStop(0, '#050706')
  background.addColorStop(0.55, '#0a0f0c')
  background.addColorStop(1, '#111712')
  context.fillStyle = background
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  const green = '#bdff00'
  const orange = '#ff6a00'
  const strong = '#f2f5f3'
  const muted = '#9ea8a1'
  const faint = '#657068'
  const panel = '#101611'
  const border = '#29322b'

  context.fillStyle = orange
  context.fillRect(0, 0, 10, CARD_HEIGHT)
  context.fillStyle = green
  context.fillRect(10, 0, 4, CARD_HEIGHT)

  const logo = await load_image(`${import.meta.env.BASE_URL}pf-icon-v2.svg`)
  context.drawImage(logo, 64, 52, 132, 132)

  context.textAlign = 'right'
  context.fillStyle = muted
  context.font = '800 30px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.fillText(data.date_label, 1016, 112)
  context.textAlign = 'left'

  context.strokeStyle = border
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(64, 210)
  context.lineTo(1016, 210)
  context.stroke()

  const title_size = fit_text(context, data.session_name, 952, 72, 42)
  context.fillStyle = strong
  context.font = `950 ${title_size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  context.fillText(data.session_name, 64, 302)

  const stat_y = 360
  const stat_height = 158
  const stat_gap = 16
  const stat_width = (952 - stat_gap * 3) / 4
  const stats = [
    ['DURATION', data.duration_label],
    ['EXERCISES', String(data.exercise_count)],
    ['SETS', String(data.completed_sets)],
    ['TONNAGE', data.total_volume_label],
  ] as const

  stats.forEach(([label, value], index) => {
    const x = 64 + index * (stat_width + stat_gap)
    rounded_rect(context, x, stat_y, stat_width, stat_height, 22)
    context.fillStyle = panel
    context.fill()
    context.strokeStyle = border
    context.lineWidth = 2
    context.stroke()

    context.fillStyle = faint
    context.font = '900 19px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    context.fillText(label, x + 24, stat_y + 42)

    const value_size = fit_text(context, value, stat_width - 48, 39, 25, 950)
    context.fillStyle = strong
    context.font = `950 ${value_size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    context.fillText(value, x + 24, stat_y + 104)
  })

  const highlight_y = 562
  const highlight_height = 188
  rounded_rect(context, 64, highlight_y, 952, highlight_height, 26)
  context.fillStyle = panel
  context.fill()
  context.strokeStyle = '#4a321f'
  context.lineWidth = 2
  context.stroke()

  draw_label(context, 'SESSION HIGHLIGHT', 92, highlight_y + 47, orange)
  if (data.session_highlight) {
    const name_size = fit_text(
      context,
      data.session_highlight.exercise_name,
      620,
      38,
      26,
      900,
    )
    context.fillStyle = strong
    context.font = `900 ${name_size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    context.fillText(data.session_highlight.exercise_name, 92, highlight_y + 105)

    context.textAlign = 'right'
    const detail_size = fit_text(
      context,
      data.session_highlight.set_detail,
      300,
      42,
      28,
      950,
    )
    context.fillStyle = green
    context.font = `950 ${detail_size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    context.fillText(data.session_highlight.set_detail, 988, highlight_y + 111)
    context.textAlign = 'left'
  } else {
    context.fillStyle = muted
    context.font = '700 32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    context.fillText('No completed working set recorded', 92, highlight_y + 112)
  }

  draw_label(context, 'EXERCISE HIGHLIGHTS', 64, 812, green)
  const row_y = 845
  const row_height = 92
  const row_gap = 12

  data.exercise_highlights.forEach((exercise, index) => {
    const y = row_y + index * (row_height + row_gap)
    rounded_rect(context, 64, y, 952, row_height, 18)
    context.fillStyle = panel
    context.fill()
    context.strokeStyle = border
    context.lineWidth = 2
    context.stroke()

    const exercise_size = fit_text(
      context,
      exercise.exercise_name,
      630,
      29,
      21,
      850,
    )
    context.fillStyle = strong
    context.font = `850 ${exercise_size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    context.fillText(exercise.exercise_name, 90, y + 57)

    context.textAlign = 'right'
    const set_size = fit_text(context, exercise.set_detail, 260, 29, 21, 900)
    context.fillStyle = green
    context.font = `900 ${set_size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    context.fillText(exercise.set_detail, 990, y + 57)
    context.textAlign = 'left'
  })

  context.textAlign = 'center'
  context.fillStyle = faint
  context.font = '800 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  context.fillText('Logged with PF', CARD_WIDTH / 2, 1300)
  context.textAlign = 'left'

  return canvas
}

function sanitise_filename_part(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
}

function canvas_png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Unable to encode the workout share image.'))
    }, 'image/png')
  })
}

export async function download_workout_share_image(
  completed_session_id: string,
): Promise<string> {
  const data = await build_workout_share_card_data(completed_session_id)
  const canvas = await render_workout_share_card(data)
  const blob = await canvas_png(canvas)
  const description = sanitise_filename_part(data.session_name) || 'WORKOUT'
  const filename = `${data.filename_date}_PROFREAK_${description}_SHARE.png`
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1500)
  return filename
}
