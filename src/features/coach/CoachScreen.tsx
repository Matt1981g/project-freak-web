import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  build_coach_export,
  load_programme_blocks,
} from '../../app/projectFreakServices'
import type {
  TrainingExport,
  TrainingExportScopeRequest,
  TrainingExportScopeType,
} from '../../application/coach/trainingExport'
import { build_weekly_coaching_brief } from '../../application/coach/weeklyBrief'
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
  return `PROJECT_FREAK_Coach_Bridge_${scope_filename_part(payload)}.json`
}

function brief_filename(payload: TrainingExport): string {
  return `PROJECT_FREAK_Coaching_Brief_${scope_filename_part(payload)}.txt`
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

  useEffect(() => {
    void Promise.all([
      generate({ type: 'last_7_days' }),
      load_programme_blocks().then((result) => {
        setBlocks(result)
        if (result.length > 0) setProgrammeBlockId(result[0].id)
      }),
    ])
  }, [generate])

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

  const json = useMemo(
    () => (payload ? JSON.stringify(payload, null, 2) : ''),
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
            Structured evidence and a readable brief from the local PROJECT FREAK
            database. Scope it to the job instead of exporting the known universe
            every time.
          </p>
        </div>
        <span>PHASE 11</span>
      </section>

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
          disabled={!selected_request || loading}
          onClick={() => {
            if (selected_request) void generate(selected_request)
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
              Training priorities are included in rank order. Historical aliases
              remain mapped to canonical definitions, while original session labels
              stay untouched.
            </p>
            <ol>
              {payload.coach_context.training_priorities.current.map(
                (priority, index) => (
                  <li key={priority}>
                    <span>{index + 1}</span>
                    <strong>{priority}</strong>
                  </li>
                ),
              )}
            </ol>
          </section>

          <section className={styles.actions}>
            <button type="button" onClick={() => void copy_brief()}>
              COPY BRIEF
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={download_brief}
            >
              DOWNLOAD BRIEF
            </button>
            <button type="button" onClick={() => void copy_json()}>
              COPY JSON
            </button>
            <button type="button" onClick={download_json}>
              DOWNLOAD JSON
            </button>
            <button
              type="button"
              onClick={() => {
                if (selected_request) void generate(selected_request)
              }}
              disabled={!selected_request || loading}
            >
              {loading ? 'REFRESHING…' : 'REFRESH SCOPE'}
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
              Choose scope → export brief + JSON → review with ChatGPT → import
              the returned programme JSON.
            </strong>
            <p>
              For weekly programming, Last 7 Days remains the normal review scope.
              The other scopes are for targeted analysis and deeper history.
            </p>
          </section>

          {status && <div className={styles.status}>{status}</div>}
          {error && <div className={styles.error}>{error}</div>}
        </>
      )}
    </div>
  )
}
