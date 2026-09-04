import { useCallback, useEffect, useRef, useState } from 'react'
import type { Exercise } from '../../domain/models'
import type { ExerciseAliasCandidateGroup } from '../../domain/rules/exerciseAliases'
import type { HistoricalImportPreview } from '../../importers/historical'
import {
  archive_exercise_definition,
  commit_historical_workbook,
  load_exercise_alias_candidates,
  load_exercise_library,
  preview_historical_workbook,
  restore_exercise_definition,
} from '../../app/projectFreakServices'
import styles from './ExerciseLibraryScreen.module.css'

function exercise_meta(exercise: Exercise): string {
  return [exercise.category, exercise.equipment]
    .filter((value): value is string => Boolean(value))
    .join(' · ')
}

function issue_summary(preview: HistoricalImportPreview) {
  const errors = preview.issues.filter((issue) => issue.severity === 'error').length
  const warnings = preview.issues.filter(
    (issue) => issue.severity === 'warning',
  ).length
  return { errors, warnings }
}

export function ExerciseLibraryScreen() {
  const file_input_ref = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [include_archived, setIncludeArchived] = useState(false)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [alias_candidates, setAliasCandidates] = useState<
    ExerciseAliasCandidateGroup[]
  >([])
  const [loading, setLoading] = useState(true)
  const [busy_id, setBusyId] = useState<string | null>(null)
  const [import_preview, setImportPreview] =
    useState<HistoricalImportPreview | null>(null)
  const [import_busy, setImportBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [library, candidates] = await Promise.all([
        load_exercise_library({
          search,
          include_archived,
        }),
        load_exercise_alias_candidates(),
      ])
      setExercises(library)
      setAliasCandidates(candidates)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load exercises.')
    } finally {
      setLoading(false)
    }
  }, [include_archived, search])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh()
    }, 100)

    return () => window.clearTimeout(timeout)
  }, [refresh])

  async function change_archive_state(exercise: Exercise) {
    setBusyId(exercise.id)
    setNotice(null)
    setError(null)

    try {
      if (exercise.archived_at) {
        await restore_exercise_definition(exercise.id)
        setNotice(`${exercise.canonical_name} restored to the active library.`)
      } else {
        await archive_exercise_definition(exercise.id)
        setNotice(`${exercise.canonical_name} archived. Historical sessions are unchanged.`)
      }
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update exercise.')
    } finally {
      setBusyId(null)
    }
  }

  async function select_workbook(file: File | undefined) {
    if (!file) return

    setImportBusy(true)
    setImportPreview(null)
    setNotice(null)
    setError(null)

    try {
      setImportPreview(await preview_historical_workbook(file))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The workbook could not be previewed.',
      )
    } finally {
      setImportBusy(false)
      if (file_input_ref.current) {
        file_input_ref.current.value = ''
      }
    }
  }

  async function commit_import() {
    if (!import_preview) return

    setImportBusy(true)
    setNotice(null)
    setError(null)

    try {
      const result = await commit_historical_workbook(import_preview)
      if (result.status === 'duplicate_noop') {
        setNotice('That exact historical workbook is already safely imported.')
      } else {
        setNotice(
          `Imported ${result.inserted.sessions} sessions, ${result.inserted.exercises} exercise labels and ${result.inserted.sets} sets.`,
        )
      }
      setImportPreview(null)
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Historical import failed.',
      )
    } finally {
      setImportBusy(false)
    }
  }

  const import_counts = import_preview ? issue_summary(import_preview) : null

  return (
    <div className={styles.screen}>
      <section className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>LIBRARY</p>
          <h1>Exercises</h1>
          <p className={styles.intro}>
            Exact historical labels stay intact. Archive what you no longer use;
            nothing silently rewrites old sessions.
          </p>
        </div>
        <div className={styles.countCard}>
          <strong>{loading ? '…' : exercises.length}</strong>
          <span>{include_archived ? 'shown' : 'active'}</span>
        </div>
      </section>

      <section className={styles.importCard}>
        <div className={styles.importCopy}>
          <span className={styles.kicker}>HISTORICAL DATA</span>
          <h2>Load the training history</h2>
          <p>
            Preview the locked XLSX first. PROJECT FREAK will refuse malformed
            data before touching the local database.
          </p>
        </div>
        <input
          ref={file_input_ref}
          className={styles.fileInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => void select_workbook(event.target.files?.[0])}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={import_busy}
          onClick={() => file_input_ref.current?.click()}
        >
          {import_busy ? 'Checking…' : 'Choose workbook'}
        </button>
      </section>

      {import_preview && import_counts && (
        <section className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <div>
              <span className={styles.kicker}>
                {import_preview.is_canonical_source
                  ? 'CANONICAL SOURCE VERIFIED'
                  : 'WORKBOOK PREVIEW'}
              </span>
              <h2>{import_preview.file_name}</h2>
            </div>
            <span
              className={
                import_preview.can_commit ? styles.readyBadge : styles.errorBadge
              }
            >
              {import_preview.can_commit ? 'READY' : 'BLOCKED'}
            </span>
          </div>

          <div className={styles.stats}>
            <div>
              <strong>{import_preview.detected.sessions}</strong>
              <span>sessions</span>
            </div>
            <div>
              <strong>{import_preview.detected.exact_exercise_labels}</strong>
              <span>labels</span>
            </div>
            <div>
              <strong>{import_preview.detected.sets}</strong>
              <span>sets</span>
            </div>
            <div>
              <strong>{import_counts.warnings}</strong>
              <span>warnings</span>
            </div>
          </div>

          {import_counts.errors > 0 && (
            <p className={styles.blockingText}>
              {import_counts.errors} blocking validation issue
              {import_counts.errors === 1 ? '' : 's'} must be resolved.
            </p>
          )}

          <div className={styles.previewActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setImportPreview(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!import_preview.can_commit || import_busy}
              onClick={() => void commit_import()}
            >
              {import_busy ? 'Importing…' : 'Import to this device'}
            </button>
          </div>
        </section>
      )}

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.errorNotice}>{error}</div>}

      <section className={styles.controls}>
        <label className={styles.searchBox}>
          <span>Search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Exercise, muscle or equipment"
            inputMode="search"
          />
        </label>
        <button
          type="button"
          className={include_archived ? styles.filterActive : styles.filterButton}
          onClick={() => setIncludeArchived((value) => !value)}
        >
          {include_archived ? 'Showing archived' : 'Active only'}
        </button>
      </section>

      {alias_candidates.length > 0 && (
        <details className={styles.aliasPanel}>
          <summary>
            <span>
              <strong>{alias_candidates.length}</strong> case-only alias groups
            </span>
            <span className={styles.reviewTag}>REVIEW ONLY</span>
          </summary>
          <p>
            These labels look equivalent by case, but PROJECT FREAK keeps every
            source label separate until you explicitly decide otherwise.
          </p>
          <div className={styles.aliasGrid}>
            {alias_candidates.map((candidate) => (
              <div className={styles.aliasRow} key={candidate.normalized_name}>
                {candidate.labels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}

      <section className={styles.list} aria-live="polite">
        {loading ? (
          <div className={styles.emptyState}>Loading exercise library…</div>
        ) : exercises.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No exercises here yet.</strong>
            <span>
              Import the historical workbook above, or clear the current search.
            </span>
          </div>
        ) : (
          exercises.map((exercise) => {
            const archived = exercise.archived_at !== null
            return (
              <article className={styles.exerciseCard} key={exercise.id}>
                <div className={styles.exerciseMain}>
                  <div className={styles.exerciseTitleRow}>
                    <h3>{exercise.canonical_name}</h3>
                    {archived && (
                      <span className={styles.archivedBadge}>ARCHIVED</span>
                    )}
                  </div>
                  <p>{exercise_meta(exercise) || 'Historical exercise label'}</p>
                  <span className={styles.source}>
                    {exercise.source_kind === 'historical_import'
                      ? 'Historical source'
                      : 'Library definition'}
                  </span>
                </div>
                <button
                  type="button"
                  className={archived ? styles.restoreButton : styles.archiveButton}
                  disabled={busy_id === exercise.id}
                  onClick={() => void change_archive_state(exercise)}
                >
                  {busy_id === exercise.id
                    ? 'Saving…'
                    : archived
                      ? 'Restore'
                      : 'Archive'}
                </button>
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
