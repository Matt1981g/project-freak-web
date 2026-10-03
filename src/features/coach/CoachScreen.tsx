import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  build_coach_export,
  load_coach_next_week_availability,
  load_programme_blocks,
  save_coach_next_week_availability,
} from '../../app/projectFreakServices'
import type {
  TrainingExport,
  TrainingExportScopeRequest,
  TrainingExportScopeType,
} from '../../application/coach/trainingExport'
import { with_end_of_week_check_in } from '../../application/coach/coachBridgeCheckIn'
import {
  COACH_WEEK_DAYS,
  type CoachAvailabilityStatus,
  type CoachWeekDay,
  type NextWeekAvailabilityState,
} from '../../application/coach/nextWeekAvailability'
import { build_weekly_coaching_brief } from '../../application/coach/weeklyBrief'
import { project_freak_filename } from '../../utils/projectFreakFilename'
import { ProgrammeImportPanel } from './ProgrammeImportPanel'
import styles from './CoachScreen.module.css'

type ProgrammeBlocks = Awaited<ReturnType<typeof load_programme_blocks>>

const SCOPE_OPTIONS: Array<{
  type: TrainingExportScopeType
  label: string
}> = [
  { type: 'today', label: 'TODAY' },
  { type: 'last_7_days', label: 'LAST 7 DAYS' },
  { type: 'exercise', label: 'EXERCISE' },
  { type: 'programme_block', label: 'MESOCYCLE' },
  { type: 'full', label: 'FULL DB' },
]

function safe_filename_part(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function scope_filename_part(payload: TrainingExport): string {
  switch (payload.scope.type) {
    case 'today':
      return `Today_${payload.scope.to_date ?? 'Unknown'}`
    case 'last_7_days':
      return `${payload.scope.from_date ?? 'Unknown'}_to_${payload.scope.to_date ?? 'Unknown'}`
    case 'exercise': {
      const exercise = payload.coach_context.exercise_catalogue.find((item) =>
        payload.scope.exercise_ids.includes(item.id),
      )
      return `Exercise_${safe_filename_part(exercise?.canonical_name ?? payload.scope.exercise_ids[0] ?? 'Unknown')}`
    }
    case 'programme_block':
      return `Mesocycle_${safe_filename_part(payload.scope.programme_block_id ?? 'Unknown')}`
    case 'full':
      return 'Full_DB'
  }
}

function export_filename(payload: TrainingExport): string {
  return project_freak_filename(
    payload.exported_at,
    `COACH_BRIDGE_${scope_filename_part(payload)}`,
    'json',
  )
}

function brief_filename(payload: TrainingExport): string {
  return project_freak_filename(
    payload.exported_at,
    `COACHING_BRIEF_${scope_filename_part(payload)}`,
    'txt',
  )
}

function count_sets(payload: TrainingExport): number {
  return payload.sessions.reduce(
    (session_total, session) =>
      session_total +
      session.exercises.reduce(
        (exercise_total, exercise) => exercise_total + exercise.sets.length,
        0,
      ),
    0,
  )
}

function scope_window(payload: TrainingExport): string {
  if (payload.scope.from_date && payload.scope.to_date) {
    return payload.scope.from_date === payload.scope.to_date
      ? payload.scope.from_date
      : `${payload.scope.from_date} → ${payload.scope.to_date}`
  }

  if (payload.scope.type === 'exercise') return 'ALL COMPLETED HISTORY'
  if (payload.scope.type === 'full') return 'ALL COMPLETED TRAINING'
  return 'NOT SPECIFIED'
}

function scope_note(type: TrainingExportScopeType): string {
  switch (type) {
    case 'today':
      return 'Today includes completed and in-progress sessions. Coach-excluded sessions stay omitted.'
    case 'last_7_days':
      return 'Last 7 Days includes completed, Coach-included sessions only.'
    case 'exercise':
      return 'Exercise scope includes all completed history for the selected canonical exercise and its merged aliases.'
    case 'programme_block':
      return 'Mesocycle scope includes completed sessions linked to the selected programme block.'
    case 'full':
      return 'Full DB includes all completed, Coach-included training history.'
  }
}

const DAY_LABELS: Record<CoachWeekDay, string> = {
  monday: 'MON',
  tuesday: 'TUE',
  wednesday: 'WED',
  thursday: 'THU',
  friday: 'FRI',
  saturday: 'SAT',
  sunday: 'SUN',
}

function availability_date(week_start_date_local: string, index: number): string {
  const value = new Date(`${week_start_date_local}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + index)
  return value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

function availability_complete(
  availability: NextWeekAvailabilityState | null,
): boolean {
  return (
    availability !== null &&
    COACH_WEEK_DAYS.every(
      (day) => availability.days[day].status !== 'unspecified',
    )
  )
}

export function CoachScreen() {
  const [payload, setPayload] = useState<TrainingExport | null>(null)
  const [blocks, setBlocks] = useState<ProgrammeBlocks>([])
  const [scopeType, setScopeType] =
    useState<TrainingExportScopeType>('last_7_days')
  const [exerciseId, setExerciseId] = useState('')
  const [programmeBlockId, setProgrammeBlockId] = useState('')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [availability, setAvailability] =
    useState<NextWeekAvailabilityState | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [availabilityDirty, setAvailabilityDirty] = useState(false)

  const generate = useCallback(async (request: TrainingExportScopeRequest) => {
    setLoading(true)
    setStatus(null)
    setError(null)

    try {
      const next = await build_coach_export(request)
      setPayload(next)
      setExerciseId(
        (current) =>
          current || next.coach_context.exercise_catalogue[0]?.id || '',
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to build the Coach Bridge export.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh_blocks = useCallback(async () => {
    const result = await load_programme_blocks()
    setBlocks(result)
    if (result.length > 0) {
      setProgrammeBlockId((current) => current || result[0].id)
    }
  }, [])

  const refresh_availability = useCallback(async () => {
    setAvailability(await load_coach_next_week_availability())
    setAvailabilityDirty(false)
  }, [])


  useEffect(() => {
    void Promise.all([
      generate({ type: 'last_7_days' }),
      refresh_blocks(),
      refresh_availability(),
    ])
  }, [generate, refresh_availability, refresh_blocks])

  const selected_request = useMemo<TrainingExportScopeRequest | null>(() => {
    switch (scopeType) {
      case 'today':
        return { type: 'today' }
      case 'last_7_days':
        return { type: 'last_7_days' }
      case 'exercise':
        return exerciseId ? { type: 'exercise', exercise_id: exerciseId } : null
      case 'programme_block':
        return programmeBlockId
          ? { type: 'programme_block', programme_block_id: programmeBlockId }
          : null
      case 'full':
        return { type: 'full' }
    }
  }, [exerciseId, programmeBlockId, scopeType])

  async function save_availability() {
    if (!availability) return

    setAvailabilitySaving(true)
    setStatus(null)
    setError(null)

    try {
      const saved = await save_coach_next_week_availability(availability)
      setAvailability(saved)
      setAvailabilityDirty(false)
      setStatus('Next-week availability saved and Coach export refreshed.')
      if (selected_request) await generate(selected_request)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to save next-week availability.',
      )
    } finally {
      setAvailabilitySaving(false)
    }
  }

  function update_availability_status(
    day: CoachWeekDay,
    statusValue: CoachAvailabilityStatus,
  ) {
    setAvailabilityDirty(true)
    setAvailability((current) => {
      if (!current) return current
      return {
        ...current,
        days: {
          ...current.days,
          [day]: {
            ...current.days[day],
            status: statusValue,
            max_minutes:
              statusValue === 'unavailable' || statusValue === 'unspecified'
                ? null
                : current.days[day].max_minutes,
          },
        },
      }
    })
  }

  function update_availability_minutes(
    day: CoachWeekDay,
    value: string,
  ) {
    setAvailabilityDirty(true)
    const parsed = value.trim() === '' ? null : Number(value)
    setAvailability((current) => {
      if (!current) return current
      return {
        ...current,
        days: {
          ...current.days,
          [day]: {
            ...current.days[day],
            max_minutes:
              parsed !== null && Number.isFinite(parsed) ? parsed : null,
          },
        },
      }
    })
  }

  const json = useMemo(
    () =>
      payload
        ? JSON.stringify(with_end_of_week_check_in(payload), null, 2)
        : '',
    [payload],
  )
  const brief = useMemo(
    () => (payload ? build_weekly_coaching_brief(payload) : ''),
    [payload],
  )

  async function copy_brief() {
    if (!brief) return

    try {
      await navigator.clipboard.writeText(brief)
      setStatus('Coaching brief copied to clipboard.')
      setError(null)
    } catch {
      setError('Clipboard copy failed. Use Download Brief instead.')
    }
  }

  function download_brief() {
    if (!payload || !brief) return

    const blob = new Blob([brief], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = brief_filename(payload)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setStatus('Coaching brief downloaded.')
    setError(null)
  }

  async function copy_json() {
    if (!json) return

    try {
      await navigator.clipboard.writeText(json)
      setStatus('JSON copied to clipboard.')
      setError(null)
    } catch {
      setError('Clipboard copy failed. Use Download JSON instead.')
    }
  }

  function download_json() {
    if (!payload || !json) return

    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = export_filename(payload)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setStatus('Coach Bridge JSON downloaded.')
    setError(null)
  }

  if (loading && !payload) {
    return <div className={styles.state}>Building Coach Bridge export…</div>
  }

  if (error && !payload) {
    return (
      <div className={styles.state}>
        <strong>{error}</strong>
        <button
          type="button"
          onClick={() => void generate({ type: 'last_7_days' })}
        >
          TRY AGAIN
        </button>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>COACH BRIDGE</p>
          <h1>Coaching export</h1>
          <p>
            Export the training evidence ChatGPT needs, then import the next
            validated programme here. The handover JSON carries the active
            exercise catalogue, dated next-week availability, Coach Instructions
            V3 and the mandatory end-of-week preference check-in automatically.
          </p>
        </div>
        <span>PHASE 11</span>
      </section>

      {availability && (
        <section className={styles.availabilityPanel}>
          <div className={styles.availabilityHeading}>
            <div>
              <span>NEXT WEEK AVAILABILITY</span>
              <strong>
                Week commencing {availability.week_start_date_local}
              </strong>
            </div>
            <em>
              {availability_complete(availability)
                ? 'COMPLETE'
                : 'CHECK REQUIRED'}
            </em>
          </div>

          <p>
            Set the days you can train before exporting. Unavailable is a hard
            constraint. Available days are opportunities, not mandatory sessions,
            and Coach may use fewer if recovery evidence warrants it.
          </p>

          {availabilityDirty && (
            <div className={styles.availabilityUnsaved}>
              UNSAVED CHANGES — save availability before copying or downloading
              Coach data.
            </div>
          )}

          <div className={styles.availabilityGrid}>
            {COACH_WEEK_DAYS.map((day, index) => {
              const item = availability.days[day]
              const canSetMinutes =
                item.status === 'available' || item.status === 'long_session'

              return (
                <div className={styles.availabilityDay} key={day}>
                  <div>
                    <strong>{DAY_LABELS[day]}</strong>
                    <span>
                      {availability_date(
                        availability.week_start_date_local,
                        index,
                      )}
                    </span>
                  </div>

                  <select
                    aria-label={`${day} availability`}
                    value={item.status}
                    onChange={(event) =>
                      update_availability_status(
                        day,
                        event.target.value as CoachAvailabilityStatus,
                      )
                    }
                  >
                    <option value="unspecified">UNSPECIFIED</option>
                    <option value="available">AVAILABLE</option>
                    <option value="long_session">LONG SESSION</option>
                    <option value="unavailable">UNAVAILABLE</option>
                  </select>

                  <label>
                    <span>MAX MIN</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="20"
                      max="240"
                      step="5"
                      disabled={!canSetMinutes}
                      value={item.max_minutes ?? ''}
                      placeholder="—"
                      onChange={(event) =>
                        update_availability_minutes(day, event.target.value)
                      }
                    />
                  </label>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            className={styles.saveAvailabilityButton}
            disabled={availabilitySaving || loading}
            onClick={() => void save_availability()}
          >
            {availabilitySaving
              ? 'SAVING…'
              : 'SAVE AVAILABILITY & REFRESH EXPORT'}
          </button>
        </section>
      )}

      <section className={styles.scopePanel}>
        <div>
          <span>EXPORT SCOPE</span>
          <strong>Choose the evidence window</strong>
        </div>

        <div className={styles.scopeButtons}>
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              className={
                scopeType === option.type ? styles.scopeButtonActive : undefined
              }
              onClick={() => setScopeType(option.type)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {scopeType === 'exercise' && payload && (
          <label className={styles.scopeSelector}>
            <span>EXERCISE</span>
            <select
              value={exerciseId}
              onChange={(event) => setExerciseId(event.target.value)}
            >
              {payload.coach_context.exercise_catalogue.map((exercise) => (
                <option value={exercise.id} key={exercise.id}>
                  {exercise.canonical_name}
                </option>
              ))}
            </select>
          </label>
        )}

        {scopeType === 'programme_block' && (
          <label className={styles.scopeSelector}>
            <span>MESOCYCLE / PROGRAMME BLOCK</span>
            <select
              value={programmeBlockId}
              onChange={(event) => setProgrammeBlockId(event.target.value)}
            >
              {blocks.map((block) => (
                <option value={block.id} key={block.id}>
                  {block.name} · {block.block_type}
                </option>
              ))}
            </select>
          </label>
        )}

        <p>{scope_note(scopeType)}</p>

        <button
          type="button"
          className={styles.buildScopeButton}
          disabled={!selected_request || loading || availabilityDirty}
          onClick={() => {
            if (selected_request && !availabilityDirty) {
              void generate(selected_request)
            }
          }}
        >
          {loading ? 'BUILDING…' : 'BUILD THIS SCOPE'}
        </button>
      </section>

      {payload && (
        <>
          <section className={styles.summary}>
            <div>
              <span>SCOPE</span>
              <strong>{payload.scope.type.replaceAll('_', ' ')}</strong>
            </div>
            <div>
              <span>WINDOW</span>
              <strong>{scope_window(payload)}</strong>
            </div>
            <div>
              <span>SESSIONS</span>
              <strong>{payload.sessions.length}</strong>
            </div>
            <div>
              <span>SETS</span>
              <strong>{count_sets(payload)}</strong>
            </div>
          </section>

          <section className={styles.context}>
            <div>
              <span>COACH CONTEXT</span>
              <h2>Prescription-ready data</h2>
            </div>
            <p>
              Training priorities, the live active exercise catalogue, alias
              mappings, dated availability, Coach Instructions V3 and the
              five-question end-of-week check-in are included automatically in
              Coach Bridge JSON.
            </p>
          </section>

          <section className={styles.actions}>
            <button
              type="button"
              disabled={availabilityDirty}
              onClick={() => void copy_brief()}
            >
              COPY BRIEF
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={availabilityDirty}
              onClick={download_brief}
            >
              DOWNLOAD BRIEF
            </button>
            <button
              type="button"
              disabled={availabilityDirty}
              onClick={() => void copy_json()}
            >
              COPY JSON
            </button>
            <button
              type="button"
              disabled={availabilityDirty}
              onClick={download_json}
            >
              DOWNLOAD JSON
            </button>
            <button
              type="button"
              onClick={() => {
                if (selected_request) void generate(selected_request)
              }}
              disabled={!selected_request || loading || availabilityDirty}
            >
              {loading
                ? 'REFRESHING…'
                : availabilityDirty
                  ? 'SAVE AVAILABILITY FIRST'
                  : 'REFRESH SCOPE'}
            </button>
          </section>

          <section className={styles.briefPreview}>
            <div>
              <span>COACHING BRIEF</span>
              <h2>Human-readable handoff</h2>
              <p>
                Deterministic summary only. The JSON remains the exact source of
                truth for programme generation.
              </p>
            </div>
            <pre>{brief}</pre>
          </section>

          <section className={styles.instructions}>
            <span>WORKFLOW</span>
            <strong>
              Set next-week availability → choose scope → download Coach Bridge
              JSON → upload to ChatGPT → type “Build next week” → confirm the
              five end-of-week questions → import the returned programme JSON below.
            </strong>
            <p>
              ChatGPT is instructed not to build the programme until you answer
              the weekly check-in. For weekly programming, Last 7 Days remains
              the normal review scope; the other scopes are for targeted analysis
              and deeper history.
            </p>
          </section>

          {status && <div className={styles.status}>{status}</div>}
          {error && <div className={styles.error}>{error}</div>}
        </>
      )}

      <ProgrammeImportPanel onImported={refresh_blocks} />
    </div>
  )
}
