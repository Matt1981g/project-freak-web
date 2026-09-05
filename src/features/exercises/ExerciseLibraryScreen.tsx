import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { Exercise } from '../../domain/models'
import type { ExerciseLibraryAudit } from '../../application/exercises/exerciseLibraryAudit'
import {
  TRAINING_PRIORITY_AREAS,
  type TrainingPriorityArea,
} from '../../application/priorities/trainingPriorities'
import type { MuscleMappingAudit } from '../../application/analysis/muscleMappingAudit'
import type { VerifiedExerciseMuscleTarget } from '../../application/analysis/muscleMappingSettings'
import type { ExerciseAliasCandidateGroup } from '../../domain/rules/exerciseAliases'
import type { HistoricalImportPreview } from '../../importers/historical'
import {
  archive_exercise_definition,
  commit_historical_workbook,
  consolidate_exercise_definitions,
  load_exercise_alias_candidates,
  load_exercise_library,
  load_exercise_library_audit,
  load_muscle_mapping_audit,
  preview_historical_workbook,
  rename_exercise_definition,
  restore_exercise_definition,
  save_exercise_muscle_mapping,
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
  const [library_audit, setLibraryAudit] =
    useState<ExerciseLibraryAudit | null>(null)
  const [muscle_audit, setMuscleAudit] =
    useState<MuscleMappingAudit | null>(null)
  const [mapping_exercise_id, setMappingExerciseId] = useState<string | null>(null)
  const [mapping_primary, setMappingPrimary] = useState<TrainingPriorityArea>('Biceps')
  const [mapping_secondary, setMappingSecondary] = useState<TrainingPriorityArea[]>([])
  const [loading, setLoading] = useState(true)
  const [busy_id, setBusyId] = useState<string | null>(null)
  const [renaming_id, setRenamingId] = useState<string | null>(null)
  const [rename_value, setRenameValue] = useState('')
  const [merge_selection, setMergeSelection] = useState<Exercise[]>([])
  const [merge_target_id, setMergeTargetId] = useState<string>('')
  const [import_preview, setImportPreview] =
    useState<HistoricalImportPreview | null>(null)
  const [import_busy, setImportBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [library, candidates, audit, muscleAudit] = await Promise.all([
        load_exercise_library({
          search,
          include_archived,
        }),
        load_exercise_alias_candidates(),
        load_exercise_library_audit(),
        load_muscle_mapping_audit(),
      ])
      setExercises(library)
      setAliasCandidates(candidates)
      setLibraryAudit(audit)
      setMuscleAudit(muscleAudit)
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

  function open_mapping_editor(exercise_id: string) {
    const row = muscle_audit?.rows.find((item) => item.exercise_id === exercise_id)
    const primary =
      row?.targets.find((target) => target.role === 'primary')?.area ?? 'Biceps'
    const secondary =
      row?.targets
        .filter((target) => target.role === 'secondary')
        .map((target) => target.area) ?? []
    setMappingExerciseId(exercise_id)
    setMappingPrimary(primary)
    setMappingSecondary(secondary)
  }

  async function save_mapping(exercise_id: string) {
    setBusyId(exercise_id)
    setError(null)
    setNotice(null)
    try {
      const targets: VerifiedExerciseMuscleTarget[] = [
        { area: mapping_primary, role: 'primary', allocation_weight: 1 },
        ...mapping_secondary
          .filter((area) => area !== mapping_primary)
          .map((area) => ({
            area,
            role: 'secondary' as const,
            allocation_weight: 0.5,
          })),
      ]
      await save_exercise_muscle_mapping(exercise_id, targets)
      setMappingExerciseId(null)
      setNotice('Explicit muscle mapping saved and queued for cross-device sync.')
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to save muscle mapping.',
      )
    } finally {
      setBusyId(null)
    }
  }

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

  async function consolidate_alias_group(
    candidate: ExerciseAliasCandidateGroup,
    target_id: string,
  ) {
    const target = candidate.members.find(
      (member) => member.exercise_id === target_id,
    )
    if (!target) return

    const source_ids = candidate.members
      .filter((member) => member.exercise_id !== target_id)
      .map((member) => member.exercise_id)

    setBusyId(target_id)
    setNotice(null)
    setError(null)

    try {
      await consolidate_exercise_definitions(source_ids, target_id)
      setNotice(
        `Kept "${target.label}" as canonical. ${source_ids.length} duplicate label${source_ids.length === 1 ? '' : 's'} archived as aliases; historical sessions are unchanged.`,
      )
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to consolidate exercise labels.',
      )
    } finally {
      setBusyId(null)
    }
  }

  async function submit_rename(exercise: Exercise) {
    setBusyId(exercise.id)
    setNotice(null)
    setError(null)

    try {
      const renamed = await rename_exercise_definition(
        exercise.id,
        rename_value,
      )
      setNotice(
        `Renamed library definition to "${renamed.canonical_name}". Historical session labels are unchanged.`,
      )
      setRenamingId(null)
      setRenameValue('')
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to rename exercise.',
      )
    } finally {
      setBusyId(null)
    }
  }

  function toggle_merge_selection(exercise: Exercise) {
    setMergeSelection((current) => {
      const already_selected = current.some((item) => item.id === exercise.id)
      const updated = already_selected
        ? current.filter((item) => item.id !== exercise.id)
        : [...current, exercise]

      setMergeTargetId((target_id) => {
        if (updated.length === 0) return ''
        if (updated.some((item) => item.id === target_id)) return target_id
        return updated[0].id
      })

      return updated
    })
  }

  async function merge_selected_exercises() {
    if (merge_selection.length < 2 || !merge_target_id) return

    const target = merge_selection.find(
      (exercise) => exercise.id === merge_target_id,
    )
    if (!target) return

    const source_ids = merge_selection
      .filter((exercise) => exercise.id !== merge_target_id)
      .map((exercise) => exercise.id)

    setBusyId(merge_target_id)
    setNotice(null)
    setError(null)

    try {
      await consolidate_exercise_definitions(source_ids, merge_target_id)
      setNotice(
        `Merged ${merge_selection.length} library definitions into "${target.canonical_name}". Original historical session labels remain unchanged.`,
      )
      setMergeSelection([])
      setMergeTargetId('')
      await refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to merge the selected exercises.',
      )
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

      {library_audit && (
        <section
          className={
            library_audit.status === 'clean'
              ? styles.auditClean
              : styles.auditWarning
          }
        >
          <div className={styles.auditHeader}>
            <div>
              <span className={styles.kicker}>LIBRARY INTEGRITY</span>
              <h2>
                {library_audit.status === 'clean'
                  ? 'Cleanup structure is sound'
                  : 'Cleanup needs review'}
              </h2>
            </div>
            <span
              className={
                library_audit.status === 'clean'
                  ? styles.readyBadge
                  : styles.reviewTag
              }
            >
              {library_audit.status === 'clean' ? 'CLEAN' : 'REVIEW'}
            </span>
          </div>

          <div className={styles.auditStats}>
            <div>
              <strong>{library_audit.active_definitions}</strong>
              <span>active</span>
            </div>
            <div>
              <strong>{library_audit.archived_definitions}</strong>
              <span>archived</span>
            </div>
            <div>
              <strong>{library_audit.alias_records}</strong>
              <span>aliases</span>
            </div>
            <div>
              <strong>{library_audit.unresolved_case_groups}</strong>
              <span>case groups</span>
            </div>
            <div>
              <strong>{library_audit.orphan_aliases}</strong>
              <span>broken links</span>
            </div>
          </div>

          <p className={styles.auditNote}>
            Total source definitions: {library_audit.total_definitions}. Archived
            definitions remain available for historical traceability.
          </p>
        </section>
      )}

      {muscle_audit && (
        <details
          className={styles.mappingAudit}
          open={muscle_audit.unmapped > 0 || muscle_audit.fallback > 0}
        >
          <summary>
            <div>
              <span className={styles.kicker}>MUSCLE MAPPING AUDIT</span>
              <strong>
                {muscle_audit.explicit + muscle_audit.researched}/{muscle_audit.active_exercises} mapped without category guessing
              </strong>
            </div>
            <span
              className={
                muscle_audit.unmapped > 0 || muscle_audit.fallback > 0
                  ? styles.reviewTag
                  : styles.readyBadge
              }
            >
              {muscle_audit.unmapped > 0
                ? `${muscle_audit.unmapped} UNMAPPED`
                : muscle_audit.fallback > 0
                  ? `${muscle_audit.fallback} REVIEW`
                  : 'RESEARCH COVERED'}
            </span>
          </summary>
          <p>
            PROJECT FREAK now auto-maps high-confidence movement families from
            multiple independent exercise references. Manual mappings still win.
            Category fallback is only used when the research rules are not strong
            enough, so you only need to review genuine exceptions rather than
            playing amateur anatomist.
          </p>
          <div className={styles.mappingStats}>
            <div><strong>{muscle_audit.explicit}</strong><span>manual / db</span></div>
            <div><strong>{muscle_audit.researched}</strong><span>researched</span></div>
            <div><strong>{muscle_audit.fallback}</strong><span>review</span></div>
            <div><strong>{muscle_audit.unmapped}</strong><span>unmapped</span></div>
          </div>
          <div className={styles.mappingList}>
            {muscle_audit.rows.map((row) => (
                <div className={styles.mappingRow} key={row.exercise_id}>
                  <div>
                    <strong>{row.canonical_name}</strong>
                    <small>
                      {row.status === 'research'
                        ? `RESEARCHED ${row.research_confidence?.toUpperCase() ?? ''}`
                        : row.status.toUpperCase()}{' '}
                      {row.category ? ` · ${row.category}` : ''} ·{' '}
                      {row.targets.length
                        ? row.targets
                            .map((target) => `${target.area} ${target.role}`)
                            .join(' · ')
                        : 'no target mapping'}
                    </small>
                    {row.research_sources.length >= 3 && (
                      <div className={styles.researchEvidence}>
                        <span>
                          {row.research_sources.length} SOURCE CROSS-CHECK
                        </span>
                        <div>
                          {row.research_sources.map((source) => (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              key={source.id}
                            >
                              {source.name}
                            </a>
                          ))}
                        </div>
                        {row.research_rationale && (
                          <small>{row.research_rationale}</small>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => open_mapping_editor(row.exercise_id)}
                  >
                    {row.status === 'explicit'
                      ? 'EDIT'
                      : row.status === 'research'
                        ? 'OVERRIDE'
                        : 'REVIEW / MAP'}
                  </button>

                  {mapping_exercise_id === row.exercise_id && (
                    <div className={styles.mappingEditor}>
                      <label>
                        <span>PRIMARY MUSCLE</span>
                        <select
                          value={mapping_primary}
                          onChange={(event) => {
                            const value = event.target.value as TrainingPriorityArea
                            setMappingPrimary(value)
                            setMappingSecondary((current) =>
                              current.filter((area) => area !== value),
                            )
                          }}
                        >
                          {TRAINING_PRIORITY_AREAS.map((area) => (
                            <option value={area} key={area}>{area}</option>
                          ))}
                        </select>
                      </label>

                      <div className={styles.secondaryPicker}>
                        <span>SECONDARY MUSCLES</span>
                        <div>
                          {TRAINING_PRIORITY_AREAS
                            .filter((area) => area !== mapping_primary)
                            .map((area) => (
                              <button
                                type="button"
                                key={area}
                                className={
                                  mapping_secondary.includes(area)
                                    ? styles.secondaryActive
                                    : undefined
                                }
                                onClick={() =>
                                  setMappingSecondary((current) =>
                                    current.includes(area)
                                      ? current.filter((item) => item !== area)
                                      : [...current, area],
                                  )
                                }
                              >
                                {area}
                              </button>
                            ))}
                        </div>
                      </div>

                      <div className={styles.mappingActions}>
                        <button
                          type="button"
                          onClick={() => setMappingExerciseId(null)}
                        >
                          CANCEL
                        </button>
                        <button
                          type="button"
                          className={styles.mappingSave}
                          disabled={busy_id === row.exercise_id}
                          onClick={() => void save_mapping(row.exercise_id)}
                        >
                          {busy_id === row.exercise_id ? 'SAVING…' : 'SAVE EXPLICIT MAPPING'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            {muscle_audit.rows.every(
              (row) => row.status === 'explicit' || row.status === 'research',
            ) && (
              <div className={styles.mappingComplete}>
                Every active exercise is covered by an explicit or
                high-confidence multi-source mapping. You may retire from
                recreational anatomy.
              </div>
            )}
          </div>
        </details>
      )}

      {merge_selection.length > 0 && (
        <section className={styles.mergePanel}>
          <div className={styles.mergeHeading}>
            <div>
              <span className={styles.kicker}>MANUAL MERGE</span>
              <h2>{merge_selection.length} selected</h2>
              <p>
                Choose the one future-facing exercise to keep. Every other
                selected definition becomes an archived alias. Historical
                sessions remain exactly as recorded.
              </p>
            </div>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => {
                setMergeSelection([])
                setMergeTargetId('')
              }}
            >
              Clear
            </button>
          </div>

          <div className={styles.mergeCandidates}>
            {merge_selection.map((exercise) => (
              <label
                className={
                  merge_target_id === exercise.id
                    ? styles.mergeCandidateActive
                    : styles.mergeCandidate
                }
                key={exercise.id}
              >
                <input
                  type="radio"
                  name="merge-target"
                  checked={merge_target_id === exercise.id}
                  onChange={() => setMergeTargetId(exercise.id)}
                />
                <span>
                  <strong>{exercise.canonical_name}</strong>
                  <small>
                    {merge_target_id === exercise.id
                      ? 'KEEP AS CANONICAL'
                      : 'BECOMES ALIAS'}
                  </small>
                </span>
              </label>
            ))}
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            disabled={merge_selection.length < 2 || busy_id !== null}
            onClick={() => void merge_selected_exercises()}
          >
            {busy_id !== null
              ? 'Merging…'
              : merge_selection.length < 2
                ? 'Select at least 2 exercises'
                : `Merge ${merge_selection.length} exercises`}
          </button>
        </section>
      )}

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
                <div className={styles.aliasRowCopy}>
                  <strong>Choose the canonical future label</strong>
                  <span>Every other label becomes an alias. History stays verbatim.</span>
                </div>
                <div className={styles.aliasChoices}>
                  {candidate.members.map((member) => (
                    <button
                      type="button"
                      className={styles.aliasChoice}
                      disabled={busy_id !== null}
                      key={member.exercise_id}
                      onClick={() =>
                        void consolidate_alias_group(
                          candidate,
                          member.exercise_id,
                        )
                      }
                    >
                      Keep {member.label}
                    </button>
                  ))}
                </div>
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
                <div className={styles.cardActions}>
                  <Link
                    className={styles.historyButton}
                    to={`/history/exercise/${exercise.id}`}
                  >
                    History
                  </Link>
                  {!archived && (
                    <button
                      type="button"
                      className={
                        merge_selection.some((item) => item.id === exercise.id)
                          ? styles.selectButtonActive
                          : styles.selectButton
                      }
                      disabled={busy_id === exercise.id}
                      onClick={() => toggle_merge_selection(exercise)}
                    >
                      {merge_selection.some((item) => item.id === exercise.id)
                        ? 'Selected'
                        : 'Select'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.renameButton}
                    disabled={busy_id === exercise.id}
                    onClick={() => {
                      setRenamingId(exercise.id)
                      setRenameValue(exercise.canonical_name)
                    }}
                  >
                    Rename
                  </button>
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
                </div>

                {renaming_id === exercise.id && (
                  <form
                    className={styles.renameEditor}
                    onSubmit={(event) => {
                      event.preventDefault()
                      void submit_rename(exercise)
                    }}
                  >
                    <label>
                      <span>Future-facing exercise name</span>
                      <input
                        autoFocus
                        value={rename_value}
                        onChange={(event) => setRenameValue(event.target.value)}
                      />
                    </label>
                    <div className={styles.renameActions}>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => {
                          setRenamingId(null)
                          setRenameValue('')
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={styles.primaryButton}
                        disabled={
                          busy_id === exercise.id || !rename_value.trim()
                        }
                      >
                        Save name
                      </button>
                    </div>
                  </form>
                )}
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
