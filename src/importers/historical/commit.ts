import type { ProjectFreakDatabase } from '../../data/db/projectFreakDb'
import type { ImportBatch, ImportIssue } from '../../domain/models'
import {
  CANONICAL_HISTORICAL_PROFILE,
  HISTORICAL_IMPORTER_TYPE,
  HISTORICAL_IMPORTER_VERSION,
} from './profile'
import { build_historical_import_plan } from './plan'
import type {
  HistoricalImportCommitResult,
  HistoricalImportPreview,
} from './types'

function result_counts(
  plan: Awaited<ReturnType<typeof build_historical_import_plan>>,
) {
  return {
    exercises: plan.exercises.length,
    sessions: plan.sessions.length,
    session_exercises: plan.session_exercises.length,
    sets: plan.sets.length,
    set_components: plan.set_components.length,
    exercise_metrics: plan.exercise_metrics.length,
    import_records: plan.import_records.length,
  }
}

export async function commit_historical_import(
  db: ProjectFreakDatabase,
  preview: HistoricalImportPreview,
  device_id: string,
): Promise<HistoricalImportCommitResult> {
  if (!preview.can_commit) {
    throw new Error(
      'Historical workbook preview contains blocking validation errors.',
    )
  }

  const prior_batch = await db.import_batches
    .where('file_sha256')
    .equals(preview.file_sha256)
    .filter((batch) => batch.status === 'committed')
    .first()

  if (prior_batch) {
    return {
      status: 'duplicate_noop',
      import_batch_id: prior_batch.id,
      inserted: {
        exercises: 0,
        sessions: 0,
        session_exercises: 0,
        sets: 0,
        set_components: 0,
        exercise_metrics: 0,
        import_records: 0,
      },
    }
  }

  const existing_records = await db.import_records
    .where('source_record_key')
    .anyOf(preview.rows.map((row) => row.source_record_key))
    .toArray()
  const existing_by_key = new Map(
    existing_records.map((record) => [record.source_record_key, record]),
  )

  for (const row of preview.rows) {
    const existing = existing_by_key.get(row.source_record_key)
    if (existing && existing.source_row_sha256 !== row.source_row_sha256) {
      throw new Error(
        `Historical import conflict for ${row.source_record_key}: an existing provenance row has different contents.`,
      )
    }
  }

  if (existing_records.length === preview.rows.length) {
    return {
      status: 'duplicate_noop',
      import_batch_id: existing_records[0]?.import_batch_id ?? null,
      inserted: {
        exercises: 0,
        sessions: 0,
        session_exercises: 0,
        sets: 0,
        set_components: 0,
        exercise_metrics: 0,
        import_records: 0,
      },
    }
  }

  if (existing_records.length > 0) {
    throw new Error(
      'Partial historical import detected. Refusing to mix batches until an explicit incremental-import workflow is approved.',
    )
  }

  const batch_id = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const plan = await build_historical_import_plan(
    preview,
    batch_id,
    device_id,
    timestamp,
  )

  const batch: ImportBatch = {
    id: batch_id,
    importer_type: HISTORICAL_IMPORTER_TYPE,
    importer_version: HISTORICAL_IMPORTER_VERSION,
    file_name: preview.file_name,
    file_sha256: preview.file_sha256,
    file_size_bytes: preview.file_size_bytes,
    started_at: timestamp,
    completed_at: timestamp,
    status: 'committed',
    expected_sessions: preview.is_canonical_source
      ? CANONICAL_HISTORICAL_PROFILE.sessions
      : null,
    detected_sessions: preview.detected.sessions,
    expected_exercises: preview.is_canonical_source
      ? CANONICAL_HISTORICAL_PROFILE.exact_exercise_labels
      : null,
    detected_exercises: preview.detected.exact_exercise_labels,
    expected_sets: preview.is_canonical_source
      ? CANONICAL_HISTORICAL_PROFILE.sets
      : null,
    detected_sets: preview.detected.sets,
    summary_json: {
      canonical_source: preview.is_canonical_source,
      detected: {
        sessions: preview.detected.sessions,
        session_exercises: preview.detected.session_exercises,
        exact_exercise_labels: preview.detected.exact_exercise_labels,
        sets: preview.detected.sets,
        case_only_duplicate_groups:
          preview.detected.case_only_duplicate_groups,
      },
      alias_candidate_groups: preview.alias_candidate_groups,
      warnings: preview.issues.filter((entry) => entry.severity === 'warning')
        .length,
    },
  }

  const import_issues: ImportIssue[] = preview.issues.map((entry) => ({
    id: crypto.randomUUID(),
    import_batch_id: batch_id,
    severity: entry.severity,
    code: entry.code,
    source_sheet: entry.source_sheet,
    source_row_number: entry.source_row_number,
    source_record_key: entry.source_record_key,
    message: entry.message,
    raw_json: entry.raw_json,
    resolution_status: 'open',
    resolved_at: null,
  }))

  await db.transaction(
    'rw',
    [
      db.exercises,
      db.completed_sessions,
      db.session_exercises,
      db.sets,
      db.set_components,
      db.exercise_metrics,
      db.import_batches,
      db.import_records,
      db.import_issues,
      db.audit_events,
      db.sync_outbox,
    ],
    async () => {
      await db.exercises.bulkAdd(plan.exercises)
      await db.completed_sessions.bulkAdd(plan.sessions)
      await db.session_exercises.bulkAdd(plan.session_exercises)
      await db.sets.bulkAdd(plan.sets)
      if (plan.set_components.length > 0) {
        await db.set_components.bulkAdd(plan.set_components)
      }
      if (plan.exercise_metrics.length > 0) {
        await db.exercise_metrics.bulkAdd(plan.exercise_metrics)
      }
      await db.import_batches.add(batch)
      await db.import_records.bulkAdd(plan.import_records)
      if (import_issues.length > 0) {
        await db.import_issues.bulkAdd(import_issues)
      }
      await db.audit_events.bulkAdd(plan.audit_events)
      await db.sync_outbox.bulkAdd(plan.sync_outbox)
    },
  )

  return {
    status: 'committed',
    import_batch_id: batch_id,
    inserted: result_counts(plan),
  }
}
