import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProgrammeBlock, ProgrammedSession } from '../../domain/models'
import type { ProgrammeImportPreview } from '../../application/programme/programmeImport'
import {
  commit_programme_json,
  export_programme_exercise_catalogue,
  load_programme_blocks,
  load_programme_sessions,
  preview_programme_json,
} from '../../app/projectFreakServices'
import styles from './PlanScreen.module.css'

interface StoredProgrammeSummary {
  block: ProgrammeBlock
  sessions: ProgrammedSession[]
}

function issue_counts(preview: ProgrammeImportPreview) {
  return {
    errors: preview.issues.filter((entry) => entry.severity === 'error').length,
    warnings: preview.issues.filter((entry) => entry.severity === 'warning')
      .length,
  }
}

function rep_target(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
): string {
  if (minimum === null || minimum === undefined) {
    return maximum === null || maximum === undefined ? 'reps open' : `≤${maximum}`
  }
  if (maximum === null || maximum === undefined) {
    return `≥${minimum}`
  }
  if (minimum === maximum) {
    return `${minimum} reps`
  }
  return `${minimum}–${maximum} reps`
}

function date_span(block: ProgrammeBlock): string {
  if (block.start_date_local && block.end_date_local) {
    return `${block.start_date_local} → ${block.end_date_local}`
  }
  return block.start_date_local ?? block.end_date_local ?? 'Dates not fixed'
}

export function PlanScreen() {
  const file_input_ref = useRef<HTMLInputElement>(null)
  const [json_text, setJsonText] = useState('')
  const [preview, setPreview] = useState<ProgrammeImportPreview | null>(null)
  const [stored, setStored] = useState<StoredProgrammeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh_programmes = useCallback(async () => {
    setLoading(true)
    try {
      const blocks = await load_programme_blocks()
      const summaries = await Promise.all(
        blocks.map(async (block) => ({
          block,
          sessions: await load_programme_sessions(block.id),
        })),
      )
      setStored(summaries)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load programmes.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh_programmes()
  }, [refresh_programmes])

  const counts = useMemo(
    () => (preview ? issue_counts(preview) : null),
    [preview],
  )

  const resolution_by_id = useMemo(
    () =>
      new Map(
        preview?.exercise_resolutions.map((resolution) => [
          resolution.exercise_id,
          resolution,
        ]) ?? [],
      ),
    [preview],
  )

  async function copy_catalogue() {
    setCopying(true)
    setNotice(null)
    setError(null)

    try {
      const catalogue = await export_programme_exercise_catalogue()
      await navigator.clipboard.writeText(catalogue)
      setNotice(
        'Active exercise catalogue copied. Paste it into ChatGPT when asking for a PROJECT FREAK programme.',
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to copy the exercise catalogue.',
      )
    } finally {
      setCopying(false)
    }
  }

  async function read_json_file(file: File | undefined) {
    if (!file) return

    setNotice(null)
    setError(null)
    setPreview(null)

    try {
      setJsonText(await file.text())
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to read JSON file.',
      )
    } finally {
      if (file_input_ref.current) {
        file_input_ref.current.value = ''
      }
    }
  }

  async function run_preview() {
    if (!json_text.trim()) return

    setPreviewing(true)
    setNotice(null)
    setError(null)

    try {
      setPreview(await preview_programme_json(json_text))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Programme preview could not be generated.',
      )
    } finally {
      setPreviewing(false)
    }
  }

  async function commit_preview() {
    if (!preview || !preview.can_commit) return

    setCommitting(true)
    setNotice(null)
    setError(null)

    try {
      const result = await commit_programme_json(preview)
      if (result === 'duplicate_noop') {
        setNotice('That exact programme is already imported. Nothing duplicated.')
      } else {
        setNotice(
          `Programme imported: ${preview.counts.sessions} sessions, ${preview.counts.exercises} exercise slots and ${preview.counts.sets} programmed sets.`,
        )
      }

      setPreview(null)
      setJsonText('')
      await refresh_programmes()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Programme import failed.',
      )
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>PLAN</p>
          <h1>Programme</h1>
          <p className={styles.intro}>
            Import a validated programme, inspect every session before it touches
            the database, then create immutable programmed snapshots for training.
          </p>
        </div>
        <div className={styles.countCard}>
          <strong>{loading ? '…' : stored.length}</strong>
          <span>blocks</span>
        </div>
      </section>

      <section className={styles.catalogueCard}>
        <div>
          <span className={styles.kicker}>CHATGPT BRIDGE</span>
          <h2>Give the coach your live exercise IDs</h2>
          <p>
            Copy the current active exercise catalogue before asking ChatGPT to
            generate a programme. This prevents stale names and invented IDs.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={copying}
          onClick={() => void copy_catalogue()}
        >
          {copying ? 'Copying…' : 'Copy active exercise catalogue'}
        </button>
      </section>

      <section className={styles.importCard}>
        <div className={styles.importHeader}>
          <div>
            <span className={styles.kicker}>PROGRAMME JSON</span>
            <h2>Preview before import</h2>
            <p>
              Invalid IDs, impossible ranges, malformed intensifiers and broken
              A1/A2 rotations are rejected before any mutation occurs.
            </p>
          </div>
          <input
            ref={file_input_ref}
            className={styles.fileInput}
            type="file"
            accept=".json,application/json"
            onChange={(event) => void read_json_file(event.target.files?.[0])}
          />
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => file_input_ref.current?.click()}
          >
            Choose JSON file
          </button>
        </div>

        <textarea
          className={styles.jsonEditor}
          value={json_text}
          onChange={(event) => {
            setJsonText(event.target.value)
            setPreview(null)
          }}
          spellCheck={false}
          placeholder={'Paste PROJECT FREAK programme JSON here…'}
        />

        <div className={styles.importActions}>
          <span>
            {json_text.trim()
              ? `${json_text.length.toLocaleString()} characters loaded`
              : 'No programme loaded'}
          </span>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!json_text.trim() || previewing}
            onClick={() => void run_preview()}
          >
            {previewing ? 'Validating…' : 'Validate & preview'}
          </button>
        </div>
      </section>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.errorNotice}>{error}</div>}

      {preview && counts && (
        <section
          className={
            preview.can_commit ? styles.previewReady : styles.previewBlocked
          }
        >
          <div className={styles.previewHeader}>
            <div>
              <span className={styles.kicker}>IMPORT PREVIEW</span>
              <h2>{preview.document?.programme.name ?? 'Invalid programme'}</h2>
              {preview.document?.programme.goal && (
                <p>{preview.document.programme.goal}</p>
              )}
            </div>
            <span
              className={
                preview.can_commit ? styles.readyBadge : styles.errorBadge
              }
            >
              {preview.can_commit ? 'READY' : 'BLOCKED'}
            </span>
          </div>

          <div className={styles.stats}>
            <div>
              <strong>{preview.counts.sessions}</strong>
              <span>sessions</span>
            </div>
            <div>
              <strong>{preview.counts.exercises}</strong>
              <span>exercise slots</span>
            </div>
            <div>
              <strong>{preview.counts.sets}</strong>
              <span>sets</span>
            </div>
            <div>
              <strong>{preview.counts.components}</strong>
              <span>components</span>
            </div>
            <div>
              <strong>{counts.warnings}</strong>
              <span>warnings</span>
            </div>
            <div>
              <strong>{counts.errors}</strong>
              <span>errors</span>
            </div>
          </div>

          {preview.issues.length > 0 && (
            <details className={styles.issuePanel} open={!preview.can_commit}>
              <summary>
                Validation report · {preview.issues.length} issue
                {preview.issues.length === 1 ? '' : 's'}
              </summary>
              <div className={styles.issueList}>
                {preview.issues.map((entry, index) => (
                  <article
                    className={
                      entry.severity === 'error'
                        ? styles.issueError
                        : styles.issueWarning
                    }
                    key={`${entry.code}-${entry.path}-${index}`}
                  >
                    <strong>{entry.code.replaceAll('_', ' ')}</strong>
                    <span>{entry.path}</span>
                    <p>{entry.message}</p>
                  </article>
                ))}
              </div>
            </details>
          )}

          {preview.document && (
            <div className={styles.sessionPreviewList}>
              {preview.document.programme.sessions.map(
                (session, session_index) => (
                  <article className={styles.sessionCard} key={session_index}>
                    <div className={styles.sessionHeader}>
                      <div>
                        <span>
                          {session.day_label ?? `Session ${session_index + 1}`}
                        </span>
                        <h3>{session.name}</h3>
                      </div>
                      <strong>
                        {session.scheduled_date_local ?? 'Unscheduled'}
                      </strong>
                    </div>

                    <div className={styles.exercisePreviewList}>
                      {[...session.exercises]
                        .sort((a, b) => a.planned_order - b.planned_order)
                        .map((exercise, exercise_index) => {
                          const resolution = resolution_by_id.get(
                            exercise.exercise_id,
                          )
                          const display_name =
                            resolution?.canonical_name ?? exercise.exercise_name

                          return (
                            <div
                              className={styles.exercisePreview}
                              key={exercise_index}
                            >
                              <div className={styles.exerciseNumber}>
                                {exercise.rotation_group_key
                                  ? `${exercise.rotation_group_key}${exercise.rotation_position ?? ''}`
                                  : exercise.planned_order}
                              </div>
                              <div className={styles.exerciseCopy}>
                                <div className={styles.exerciseNameLine}>
                                  <strong>{display_name}</strong>
                                  {resolution &&
                                    resolution.imported_name !==
                                      resolution.canonical_name && (
                                      <span className={styles.resolvedBadge}>
                                        NAME RESOLVED
                                      </span>
                                    )}
                                </div>
                                <span>
                                  {exercise.sets.length} sets ·{' '}
                                  {rep_target(
                                    exercise.target_rep_min,
                                    exercise.target_rep_max,
                                  )}
                                  {exercise.rest_seconds !== null &&
                                  exercise.rest_seconds !== undefined
                                    ? ` · ${exercise.rest_seconds}s rest`
                                    : ''}
                                </span>
                                {exercise.technique_cue && (
                                  <p>{exercise.technique_cue}</p>
                                )}
                              </div>
                              <div className={styles.setPills}>
                                {exercise.sets.map((set) => (
                                  <span key={set.set_number}>
                                    S{set.set_number} · {set.structure_type}
                                    {set.target_rep_min !== null ||
                                    set.target_rep_max !== null
                                      ? ` · ${rep_target(
                                          set.target_rep_min,
                                          set.target_rep_max,
                                        )}`
                                      : ''}
                                    {set.failure_target !== 'none'
                                      ? ` · failure ${set.failure_target}`
                                      : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </article>
                ),
              )}
            </div>
          )}

          <div className={styles.previewActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setPreview(null)}
            >
              Back to JSON
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!preview.can_commit || committing}
              onClick={() => void commit_preview()}
            >
              {committing ? 'Importing…' : 'Import programme'}
            </button>
          </div>
        </section>
      )}

      <section className={styles.storedSection}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.kicker}>LOCAL DATABASE</span>
            <h2>Programme blocks</h2>
          </div>
          <span>{loading ? 'Loading…' : `${stored.length} stored`}</span>
        </div>

        {loading ? (
          <div className={styles.emptyState}>Loading programmes…</div>
        ) : stored.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No programme imported yet.</strong>
            <span>
              The historical training database is safe. Programme data lives in
              separate versioned stores.
            </span>
          </div>
        ) : (
          <div className={styles.blockList}>
            {stored.map(({ block, sessions }) => (
              <article className={styles.blockCard} key={block.id}>
                <div className={styles.blockHeader}>
                  <div>
                    <span>{block.block_type}</span>
                    <h3>{block.name}</h3>
                  </div>
                  <span className={styles.statusBadge}>{block.status}</span>
                </div>
                <p>{block.goal ?? 'No block goal recorded.'}</p>
                <div className={styles.blockMeta}>
                  <span>{date_span(block)}</span>
                  <strong>{sessions.length} sessions</strong>
                </div>
                {sessions.length > 0 && (
                  <div className={styles.storedSessions}>
                    {sessions.map((session) => (
                      <span key={session.id}>
                        {session.scheduled_date_local ?? 'TBC'} ·{' '}
                        {session.name_snapshot}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
